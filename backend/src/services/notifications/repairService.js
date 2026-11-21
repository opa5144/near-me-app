const mongoose = require('mongoose');
const User = require('../../models/User');
const { findEvents } = require('../../models/eventStore');
const EventSelection = require('../../models/EventSelection');
const EventRating = require('../../models/EventRating');
const EventInvite = require('../../models/EventInvite');
const Friendship = require('../../models/Friendship');
const { versionOf, requestedAt } = require('./friendRequestService');
const Notification = require('../../models/Notification');
const NotificationJob = require('../../models/NotificationJob');
const NotificationDelivery = require('../../models/NotificationDelivery');
const { NOTIFICATION_TYPES, TIMED_TYPES, EXTERNAL_CHANNELS } = require('../../constants/notificationTypes');
const { getNotificationConfig } = require('../../config/notifications');
const { ratingEligibility } = require('../eventRatingService');
const { loadNotificationContext, allowedChannels } = require('./policyService');
const { renderNotification } = require('./templates');
const { notificationOccurrence } = require('./timing');
const { notificationKey } = require('./keys');

const REPAIR = 'truthful-community-notifications-v1';
const HOUR = 60 * 60 * 1000;
const object = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
const id = value => String(value?._id ?? value);
const time = value => value == null ? NaN : new Date(value).getTime();
const generation = value => Number.isSafeInteger(value) && value >= 0 ? value : 0;
const pair = (userId, eventId) => `${id(userId)}:${id(eventId)}`;
const sameTime = (first, second) => Number.isFinite(time(first)) && time(first) === time(second);
const validSchedule = event => Number.isFinite(time(event?.startsAt)) && time(event.endsAt) > time(event.startsAt);
const isFixture = row => Boolean(row.data?.isTest || row.data?.testSeed ||
  /^\[Test\]\s/.test(row.title || '') || /^Test preview:/.test(row.message || ''));
const dataPayload = row => object(row.data?.payload);
const jobPayload = job => ({ ...object(job?.payload?.context), ...object(job?.payload) });

function eventSnapshot(event) {
  return { id: id(event), hostId: id(event.hostId), title: event.title, place: event.place, address: event.address,
    startsAt: event.startsAt, endsAt: event.endsAt, registrationClosesAt: event.registrationClosesAt || event.endsAt,
    timeZone: event.timeZone, status: event.status || 'published', cancelledAt: event.cancelledAt,
    cancellationReason: event.cancellationReason || '' };
}

// The coordinator must back up notifications/jobs/deliveries before applying.
// This service never starts a worker or invokes a delivery provider.
async function readState(session) {
  const read = query => query.session(session || null).lean();
  const users = await read(User.find().select('_id username email deletedAt'));
  const events = await findEvents({ status: { $ne: 'draft' } }, { session });
  const selections = await read(EventSelection.find());
  const ratings = await read(EventRating.find().select('userId eventId'));
  const notifications = await read(Notification.find());
  const jobs = await read(NotificationJob.find());
  const deliveries = await read(NotificationDelivery.find());
  const invites = await read(EventInvite.find());
  const friendships = await read(Friendship.find());
  return {
    users: new Map(users.map(user => [id(user), user])), events: new Map(events.map(event => [id(event), event])),
    selections: new Map(selections.map(selection => [pair(selection.userId, selection.eventId), selection])),
    rated: new Set(ratings.map(rating => pair(rating.userId, rating.eventId))), notifications, jobs,
    jobsByKey: new Map(jobs.map(job => [job.key, job])), deliveries,
    invites: new Map(invites.map(invite => [id(invite), invite])),
    friendships: new Map(friendships.map(request => [id(request), request])),
  };
}

function stateFor(row, state) {
  const event = state.events.get(id(row.eventId));
  return { user: state.users.get(id(row.userId)), event, host: event && state.users.get(id(event.hostId)),
    selection: state.selections.get(pair(row.userId, row.eventId)), payload: dataPayload(row) };
}

function snapshotMatches(snapshot, event) {
  return id(snapshot.id || snapshot._id) === id(event) && validSchedule(snapshot) && typeof snapshot.title === 'string';
}

// A completed outbox occurrence is evidence of an earlier committed fact even
// when registration, following or the event schedule subsequently changed.
function sourceFact(row, state) {
  const job = state.jobsByKey.get(row.dedupeKey);
  return job?.kind === 'notification' && job.state === 'done' && job.type === row.type &&
    id(job.userId) === id(row.userId) &&
    (row.type === 'FRIEND_REQUEST' ? (id(job.actorId) === id(row.actorId) &&
      job.payload?.requestId === String(row.requestId || row.data?.requestId) &&
      job.payload?.requestVersion === dataPayload(row).requestVersion) : id(job.eventId) === id(row.eventId)) &&
    sameTime(notificationOccurrence(job), row.occurredAt) ? job : null;
}

function assess(row, state, now) {
  if (isFixture(row)) return { valid: false, reason: 'UNVERIFIED_TEST_FIXTURE' };
  const context = stateFor(row, state);
  const { user, event, host, selection, payload } = context;
  if (row.type === 'FRIEND_REQUEST') {
    const requestId = row.requestId || row.data?.requestId || payload.requestId;
    const request = state.friendships.get(id(requestId));
    const sender = state.users.get(id(row.actorId));
    const occurrence = time(row.occurredAt);
    const historicalJob = sourceFact(row, state);
    const currentOccurrence = request && id(request.recipient) === id(row.userId) &&
      id(request.requester) === id(row.actorId) && payload.requestVersion === versionOf(request) &&
      sameTime(requestedAt(request), row.occurredAt);
    if (!user || !sender || user.deletedAt != null || sender.deletedAt != null || !request ||
        !Number.isFinite(occurrence) || occurrence > now.getTime() ||
        !(currentOccurrence || historicalJob)) return { valid: false, reason: 'FRIEND_REQUEST_SOURCE_UNAVAILABLE' };
    const content = renderNotification('FRIEND_REQUEST', { user, sender, request, payload,
      job: { type: row.type, payload, createdAt: row.createdAt, dueAt: row.occurredAt } });
    return { valid: true, content };
  }
  if (!user || !event || !host || !validSchedule(event)) return { valid: false, reason: 'SOURCE_UNAVAILABLE' };
  if (user.deletedAt != null || host.deletedAt != null) return { valid: false, reason: 'ACCOUNT_ARCHIVED' };
  const occurred = time(row.occurredAt);
  if (!NOTIFICATION_TYPES.includes(row.type) || !Number.isFinite(occurred) || occurred > now.getTime()) {
    return { valid: false, reason: 'INVALID_OCCURRENCE' };
  }
  const factJob = sourceFact(row, state);
  const snapshot = object(payload.eventSnapshot);
  const hasSnapshot = snapshotMatches(snapshot, event);
  let valid = false;
  let renderedEvent = event;

  if (TIMED_TYPES.includes(row.type)) {
    const job = { type: row.type, payload };
    const due = time(notificationOccurrence(job));
    const grace = getNotificationConfig().graceMs;
    // The recorded occurrence must really be at the schedule's reminder anchor;
    // simply pointing a 24-hour label at an arbitrary event is never sufficient.
    valid = Number.isFinite(due) && occurred >= due && occurred <= due + grace;
    if (row.type === 'RATE_ATTENDED_EVENT') {
      valid = valid && ratingEligibility(event, selection, user._id, now).canRate;
    } else if (row.type === 'SAVED_EVENT_REGISTRATION_CLOSING') {
      valid = valid && Boolean(factJob || (selection?.interested && !selection.attending &&
        time(selection.savedAt) <= occurred && sameTime(payload.expectedClosesAt, event.registrationClosesAt || event.endsAt)));
    } else {
      valid = valid && Boolean(factJob || (selection?.attending && time(selection.registeredAt) <= occurred &&
        sameTime(payload.expectedStartsAt, event.startsAt)));
    }
    // Historical reminders describe the schedule that was recorded at issuance.
    // Neutral headings and explicit dates remain true when opened days later.
    renderedEvent = { ...event, startsAt: payload.expectedStartsAt || event.startsAt,
      endsAt: payload.expectedEndsAt || event.endsAt,
      registrationClosesAt: payload.expectedClosesAt || event.registrationClosesAt };
  } else if (row.type === 'REGISTRATION_CONFIRMED') {
    valid = Boolean(factJob || (selection?.attending && sameTime(selection.registeredAt, row.occurredAt)));
  } else if (row.type === 'REGISTRATION_CANCELLED') {
    valid = Boolean(factJob || (selection && !selection.attending && sameTime(selection.cancelledAt, row.occurredAt)));
  } else if (row.type === 'EVENT_CANCELLED') {
    valid = Boolean((['cancelled', 'archived'].includes(event.status) && time(event.cancelledAt) <= occurred) ||
      (factJob && hasSnapshot && ['cancelled', 'archived'].includes(snapshot.status)));
  } else if (row.type === 'EVENT_DATETIME_CHANGED' || row.type === 'EVENT_LOCATION_CHANGED') {
    valid = Boolean(factJob && hasSnapshot && payload.changes?.[row.type === 'EVENT_DATETIME_CHANGED' ? 'dateTime' : 'location']);
  } else if (row.type === 'FOLLOWED_ORGANIZER_NEW_EVENT') {
    valid = Boolean(factJob && hasSnapshot);
  } else if (row.type === 'EVENT_INVITE') {
    const invite = state.invites.get(String(row.data?.inviteId || payload.inviteId || ''));
    valid = Boolean(invite && id(invite.eventId) === id(event) && id(invite.recipientId) === id(user) &&
      id(invite.senderId) === id(row.actorId) && time(invite.createdAt) <= occurred);
    context.sender = invite && state.users.get(id(invite.senderId));
  }
  if (!valid) return { valid: false, reason: 'OCCURRENCE_NOT_SUPPORTED_BY_SOURCE' };
  const job = { type: row.type, payload, createdAt: row.createdAt, dueAt: row.data?.dueAt || row.occurredAt,
    expiresAt: row.data?.expiresAt };
  const content = renderNotification(row.type, { ...context, event: renderedEvent,
    eventSnapshot: hasSnapshot ? snapshot : event, payload, job });
  if (TIMED_TYPES.includes(row.type) && (!sameTime(renderedEvent.startsAt, event.startsAt) ||
      !sameTime(renderedEvent.endsAt, event.endsAt))) {
    content.message = 'Schedule recorded by this reminder: ' + content.message;
  }
  return { valid: true, content };
}

function replacement(row, event, user, type, occurredAt, now, wasFixtureRecipient) {
  const payload = { eventVersion: generation(event.notificationVersion), registrationVersion: generation(row.registrationVersion),
    selectionVersion: generation(row.selectionVersion), occurredAt: occurredAt.toISOString(),
    expectedStartsAt: event.startsAt.toISOString(), expectedEndsAt: event.endsAt.toISOString(),
    expectedClosesAt: new Date(event.registrationClosesAt || event.endsAt).toISOString(), eventSnapshot: eventSnapshot(event) };
  const dedupeKey = type === 'REGISTRATION_CONFIRMED'
    ? notificationKey('registration', type, row.userId, row.eventId, generation(row.registrationVersion))
    : notificationKey(REPAIR, type, row.userId, row.eventId, generation(row.registrationVersion));
  const content = renderNotification(type, { user, host: { username: '' }, selection: row, event,
    eventSnapshot: eventSnapshot(event), payload, job: { type, payload, createdAt: occurredAt, dueAt: occurredAt } });
  return { _id: new mongoose.Types.ObjectId(), userId: row.userId, eventId: row.eventId,
    actorId: type === 'REGISTRATION_CONFIRMED' ? row.userId : event.hostId, type,
    title: content.title, message: content.message, data: { ...content.data, repairSource: REPAIR,
      ...(wasFixtureRecipient ? { replacedFixtureRecipient: true } : {}) }, action: content.action,
    channels: ['inApp'], isRead: false, readAt: null, dedupeKey,
    occurredAt, createdAt: occurredAt, updatedAt: now };
}

function staleTimedJob(job, state, now) {
  const event = state.events.get(id(job.eventId));
  const selection = state.selections.get(pair(job.userId, job.eventId));
  const payload = jobPayload(job);
  const due = time(notificationOccurrence(job));
  const user = state.users.get(id(job.userId));
  const host = event && state.users.get(id(event.hostId));
  if (!user || !host || user.deletedAt != null || host.deletedAt != null || !event || !validSchedule(event) ||
      !selection || ['cancelled', 'archived', 'draft'].includes(event.status) || !Number.isFinite(due) ||
      due + getNotificationConfig().graceMs < now.getTime() ||
      generation(event.notificationVersion) !== payload.eventVersion ||
      generation(selection.registrationVersion) !== payload.registrationVersion) return true;
  if (job.type === 'SAVED_EVENT_REGISTRATION_CLOSING') return !selection.interested || selection.attending ||
    generation(selection.selectionVersion) !== payload.selectionVersion ||
    !sameTime(payload.expectedClosesAt, event.registrationClosesAt || event.endsAt);
  if (job.type === 'RATE_ATTENDED_EVENT') return !selection.attending ||
    state.rated.has(pair(job.userId, job.eventId)) || !sameTime(payload.expectedEndsAt, event.endsAt);
  return !selection.attending || !sameTime(payload.expectedStartsAt, event.startsAt);
}

async function makePlan(now, session) {
  if (!Number.isFinite(now.getTime())) throw new Error('Notification repair needs a valid current instant.');
  const state = await readState(session);
  // A population import may take time. Never mistake a concurrently committed
  // real occurrence for a future fake merely because the coordinator started earlier.
  now = new Date(Math.max(now.getTime(), Date.now()));
  const fixtureRecipients = new Set(state.notifications.filter(row => isFixture(row) || row.data?.replacedFixtureRecipient)
    .map(row => id(row.userId)));
  const targetRecipients = new Set(fixtureRecipients);
  for (const user of state.users.values()) {
    if (/^nearmecommunity(?:00[1-9]|0[1-4]\d|050)$/.test(user.username || '') &&
        user.email === `${user.username}@example.invalid` && user.deletedAt == null) targetRecipients.add(id(user));
  }
  const updates = [], removals = [], archived = [], inserts = [], reasons = {};
  const invalidIds = new Set();
  const deliveriesByNotification = new Map();
  for (const delivery of state.deliveries) {
    const key = id(delivery.notificationId);
    if (!deliveriesByNotification.has(key)) deliveriesByNotification.set(key, []);
    deliveriesByNotification.get(key).push(delivery);
  }
  const liveKeys = new Set();
  for (const row of state.notifications) {
    if (state.users.get(id(row.userId))?.deletedAt != null ||
        (row.type === 'FRIEND_REQUEST' && state.users.get(id(row.actorId))?.deletedAt != null) ||
        state.users.get(id(state.events.get(id(row.eventId))?.hostId))?.deletedAt != null) {
      throw new Error('Resolve archived-account notification history before running this active-account repair.');
    }
    if (row.data?.archivedForCorrection) { archived.push({ id: row._id, unchanged: true }); continue; }
    const result = assess(row, state, now);
    if (result.valid) {
      liveKeys.add(row.dedupeKey);
      if (row.title !== result.content.title || row.message !== result.content.message) {
        updates.push({ id: row._id, title: result.content.title, message: result.content.message });
      }
      continue;
    }
    invalidIds.add(id(row)); reasons[result.reason] = (reasons[result.reason] || 0) + 1;
    const deliveries = deliveriesByNotification.get(id(row)) || [];
    if (deliveries.length) {
      // Keep provider audit references intact, but remove disproven history from
      // the in-app inbox. Accepted/unknown/in-flight sends are never rewritten.
      const channels = [...new Set([...(Array.isArray(row.channels) ? row.channels : []).filter(channel => EXTERNAL_CHANNELS.includes(channel)),
        ...deliveries.map(delivery => delivery.channel).filter(channel => EXTERNAL_CHANNELS.includes(channel))])];
      if (!channels.length) throw new Error('A notification delivery has no supported audit channel.');
      archived.push({ id: row._id, channels, reason: result.reason });
    } else removals.push(row._id);
  }

  const reservedKeys = new Set(state.notifications.filter(row => row.data?.archivedForCorrection ||
    archived.some(saved => id(saved.id) === id(row))).map(row => row.dedupeKey));
  const channelPermissions = new Map();
  let suppressedByPreferences = 0;
  async function permitsInApp(userId, type) {
    const key = `${id(userId)}:${type}`;
    if (!channelPermissions.has(key)) {
      channelPermissions.set(key, (await allowedChannels(userId, type, { session })).includes('inApp'));
    }
    return channelPermissions.get(key);
  }
  const recipientCounts = new Map([...targetRecipients].map(userId => [userId, { confirmations: 0, ratingPrompts: 0 }]));
  for (const selection of state.selections.values()) {
    if (!selection.attending || !targetRecipients.has(id(selection.userId))) continue;
    const user = state.users.get(id(selection.userId));
    const event = state.events.get(id(selection.eventId));
    const host = event && state.users.get(id(event.hostId));
    if (!user || !host || user.deletedAt != null || host.deletedAt != null || !validSchedule(event) ||
        ['cancelled', 'archived', 'draft'].includes(event.status) || id(event.hostId) === id(user)) continue;
    const candidates = [];
    const registered = time(selection.registeredAt);
    if (Number.isFinite(registered) && registered <= now.getTime() && registered < time(event.registrationClosesAt || event.endsAt)) {
      candidates.push(['REGISTRATION_CONFIRMED', new Date(registered), 'confirmations']);
    }
    const ratingDue = time(event.endsAt) + HOUR;
    if (ratingDue <= now.getTime() && !state.rated.has(pair(user, event)) && ratingEligibility(event, selection, user._id, now).canRate) {
      candidates.push(['RATE_ATTENDED_EVENT', new Date(ratingDue), 'ratingPrompts']);
    }
    for (const [type, occurredAt, countKey] of candidates) {
      const row = replacement(selection, event, user, type, occurredAt, now, fixtureRecipients.has(id(user)));
      // An immutable provider audit row may already reserve the normal key.
      // Give its factual replacement a stable key without changing that history.
      if (reservedKeys.has(row.dedupeKey)) row.dedupeKey = notificationKey(REPAIR, 'replacement', row.dedupeKey);
      recipientCounts.get(id(user))[countKey]++;
      if (liveKeys.has(row.dedupeKey)) continue;
      // Corrections do not override an account's channel/type preferences. This
      // import only materializes permitted in-app records; it never sends out.
      if (!(await permitsInApp(user._id, type))) { suppressedByPreferences++; continue; }
      await new Notification(row).validate();
      inserts.push(row); liveKeys.add(row.dedupeKey);
    }
  }

  const skippedJobs = [], skippedDeliveries = [];
  for (const job of state.jobs) {
    if (!['pending', 'blocked', 'processing'].includes(job.state)) continue;
    const expired = job.expiresAt != null && time(job.expiresAt) < now.getTime();
    if (job.kind === 'notification' && TIMED_TYPES.includes(job.type)) {
      if (staleTimedJob(job, state, now)) skippedJobs.push(job._id);
    } else if (job.kind === 'notification' && time(job.dueAt) <= now.getTime()) {
      if (!(await loadNotificationContext(job, now, { session }))) skippedJobs.push(job._id);
    } else if (job.kind === 'delivery') {
      const delivery = state.deliveries.find(row => id(row) === String(job.payload?.deliveryId));
      const leaseActive = job.state === 'processing' && time(job.leaseUntil) > now.getTime();
      if (delivery && (invalidIds.has(id(delivery.notificationId)) || expired) &&
          !leaseActive && ['pending', 'blocked'].includes(delivery.status)) {
        skippedJobs.push(job._id); skippedDeliveries.push(delivery._id);
      }
    } else if (job.kind === 'fanout' && expired) skippedJobs.push(job._id);
  }
  return { now, updates, removals, archived, inserts, skippedJobs, skippedDeliveries,
    activeUserIds: [...state.users.values()].filter(user => user.deletedAt == null).map(user => user._id),
    summary: { asOf: now.toISOString(), notificationsBefore: state.notifications.length, unverifiedFixtures: state.notifications.filter(isFixture).length,
      removedUnsupported: removals.length, archivedProviderHistory: archived.filter(row => !row.unchanged).length,
      correctedContent: updates.length, truthfulConfirmationsAdded: inserts.filter(row => row.type === 'REGISTRATION_CONFIRMED').length,
      truthfulRatingPromptsAdded: inserts.filter(row => row.type === 'RATE_ATTENDED_EVENT').length,
      newInAppSuppressedByPreferences: suppressedByPreferences,
      recipientsWithTruthfulSources: [...recipientCounts.values()].filter(count => count.confirmations + count.ratingPrompts > 0).length,
      originalRecipientsWithoutTruthfulSource: [...fixtureRecipients].filter(userId => {
        const counts = recipientCounts.get(userId); return !counts || counts.confirmations + counts.ratingPrompts === 0;
      }), originalRecipientSources: [...fixtureRecipients].map(userId => ({ userId, ...recipientCounts.get(userId) })),
      obsoleteJobsSkipped: skippedJobs.length, unsentDeliveriesSkipped: skippedDeliveries.length, invalidReasons: reasons } };
}

async function previewNotificationRepair({ now = new Date() } = {}) {
  return (await makePlan(new Date(now))).summary;
}

async function repairNotifications({ now = new Date() } = {}) {
  const instant = new Date(now);
  return mongoose.connection.transaction(async session => {
    // Serialize against account closure and normal notification materialization.
    const accounts = await User.find({ deletedAt: null }).select('_id').sort({ _id: 1 }).session(session).lean();
    for (const account of accounts) {
      const fenced = await User.updateOne({ _id: account._id, deletedAt: null },
        { $inc: { archiveWriteVersion: 1 } }, { session, timestamps: false });
      if (!fenced.matchedCount) throw new Error('An account became unavailable during notification repair.');
    }
    const plan = await makePlan(instant, session);
    if (plan.removals.length) await Notification.deleteMany({ _id: { $in: plan.removals } }, { session });
    for (const row of plan.archived.filter(row => !row.unchanged)) await Notification.updateOne({ _id: row.id }, {
      $set: { channels: row.channels, action: null, 'data.archivedForCorrection': true, 'data.correctionReason': row.reason },
    }, { session, runValidators: true });
    if (plan.updates.length) await Notification.bulkWrite(plan.updates.map(row => ({ updateOne: {
      filter: { _id: row.id }, update: { $set: { title: row.title, message: row.message } },
    } })), { session });
    if (plan.inserts.length) await Notification.bulkWrite(plan.inserts.map(row => ({ updateOne: {
      filter: { dedupeKey: row.dedupeKey }, update: { $setOnInsert: row }, upsert: true,
    } })), { session, timestamps: false });
    if (plan.skippedJobs.length) await NotificationJob.updateMany({ _id: { $in: plan.skippedJobs }, state: { $in: ['pending', 'blocked', 'processing'] } },
      { $set: { state: 'skipped', finishedAt: plan.now, leaseOwner: null, leaseUntil: null, lastErrorCode: 'TRUTHFUL_NOTIFICATION_REPAIR' } }, { session });
    if (plan.skippedDeliveries.length) await NotificationDelivery.updateMany({ _id: { $in: plan.skippedDeliveries }, status: { $in: ['pending', 'blocked'] } },
      { $set: { status: 'skipped', errorCode: 'TRUTHFUL_NOTIFICATION_REPAIR' } }, { session });
    const reset = await Notification.updateMany({ userId: { $in: plan.activeUserIds } }, { $set: { isRead: false, readAt: null } }, { session });
    const originalRecipientNotificationsAfter = [];
    for (const source of plan.summary.originalRecipientSources) originalRecipientNotificationsAfter.push({ userId: source.userId,
      inAppNotifications: await Notification.countDocuments({ userId: source.userId, channels: 'inApp' }).session(session) });
    return { ...plan.summary, originalRecipientNotificationsAfter, notificationsAfter: await Notification.countDocuments().session(session),
      resetToUnread: reset.matchedCount, readRemaining: await Notification.countDocuments({ isRead: true }).session(session) };
  });
}

module.exports = { previewNotificationRepair, repairNotifications };
