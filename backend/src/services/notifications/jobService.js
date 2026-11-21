const mongoose = require('mongoose');
const { randomUUID } = require('node:crypto');
const User = require('../../models/User');
const { collections, findEventById, withEventSnapshot } = require('../../models/eventStore');
const EventSelection = require('../../models/EventSelection');
const Notification = require('../../models/Notification');
const NotificationJob = require('../../models/NotificationJob');
const NotificationDelivery = require('../../models/NotificationDelivery');
const PushDevice = require('../../models/PushDevice');
const { CHANNEL_PROVIDERS, EXTERNAL_CHANNELS, NOTIFICATION_TYPES, TIMED_TYPES } = require('../../constants/notificationTypes');
const { getNotificationConfig } = require('../../config/notifications');
const { notificationKey } = require('./keys');
const { loadNotificationContext, allowedChannels } = require('./policyService');
const { renderNotification } = require('./templates');
const { scheduleSelectionNotifications } = require('./triggerService');
const deliveryService = require('./deliveryService');
const { notificationOccurrence } = require('./timing');

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const validId = value => /^[a-f0-9]{24}$/i.test(String(value));
const instant = value => value == null ? NaN : new Date(value).getTime();
const object = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
let reconciliationAfter = null;

class AccountUnavailable extends Error {}
class LeaseLost extends Error {}

// This trusted background operation has no synthetic login/session. It shares
// the existing sorted User fence with account closure and domain mutations.
async function withActiveAccounts(ids, write) {
  const accounts = [...new Set(ids.map(String))].sort();
  return mongoose.connection.transaction(async session => {
    for (const id of accounts) {
      if (!validId(id)) throw new AccountUnavailable();
      const result = await User.updateOne({ _id: id, deletedAt: null }, {
        $inc: { archiveWriteVersion: 1 },
      }, { session, timestamps: false });
      if (!result.matchedCount) throw new AccountUnavailable();
    }
    return write(session);
  });
}

function owned(job, workerId) {
  return { _id: job._id, state: 'processing', leaseOwner: workerId, leaseUntil: { $gt: new Date() } };
}

async function keepLease(job, workerId, session) {
  const result = await NotificationJob.updateOne(owned(job, workerId), {
    $set: { leaseUntil: new Date(Date.now() + getNotificationConfig().leaseMs) },
  }, { session });
  if (!result.matchedCount) throw new LeaseLost();
}

async function finish(job, workerId, state, errorCode = null, session) {
  const result = await NotificationJob.updateOne(owned(job, workerId), {
    $set: { state, finishedAt: new Date(), leaseOwner: null, leaseUntil: null, lastErrorCode: errorCode },
  }, session ? { session } : {});
  if (!result.matchedCount) throw new LeaseLost();
  return state;
}

function expired(job, now = Date.now()) {
  if (job.expiresAt != null) return !Number.isFinite(instant(job.expiresAt)) || now > instant(job.expiresAt);
  return TIMED_TYPES.includes(job.type) && now > instant(notificationOccurrence(job)) + getNotificationConfig().graceMs;
}

function occurredAt(job, context) {
  if (TIMED_TYPES.includes(job.type)) return notificationOccurrence(job) ?? new Date();
  const value = context.payload.occurredAt ?? job.createdAt ?? job.dueAt;
  return Number.isFinite(instant(value)) ? new Date(value) : new Date();
}

async function insertDelivery(notification, channel, deviceId, job, session) {
  const destinationKey = channel === 'push' ? 'device:' + deviceId : channel;
  const [delivery] = await NotificationDelivery.create([{
    notificationId: notification._id, userId: notification.userId, eventId: notification.eventId,
    requestId: notification.requestId ?? null,
    channel, destinationKey, ...(deviceId ? { deviceId } : {}),
    provider: CHANNEL_PROVIDERS[channel], status: 'pending',
  }], { session });
  await NotificationJob.create([{
    key: notificationKey('delivery', delivery._id), kind: 'delivery', type: notification.type,
    userId: notification.userId, eventId: notification.eventId,
    dueAt: new Date(), expiresAt: job.expiresAt ?? null,
    payload: { deliveryId: String(delivery._id) },
  }], { session });
}

async function markUnsentDelivery(job, status, code) {
  const id = object(job.payload).deliveryId;
  if (job.kind !== 'delivery' || !validId(id)) return;
  // Never turn provider acceptance, an in-flight send, or an uncertain outcome
  // into a failed/skipped send merely because its scheduler job has finished.
  await NotificationDelivery.updateOne({
    _id: id, ...(job.userId ? { userId: job.userId } : {}), status: { $in: ['pending', 'blocked'] },
  }, { $set: { status, errorCode: code } });
}

async function materialize(job, workerId) {
  const initial = await loadNotificationContext(job);
  if (!initial) return finish(job, workerId, 'skipped', 'NO_LONGER_ELIGIBLE');
  try {
    return await withActiveAccounts([job.userId, ...(initial.event?.hostId ? [initial.event.hostId] : []),
      ...(['EVENT_INVITE', 'FRIEND_REQUEST'].includes(job.type) && job.actorId ? [job.actorId] : [])], async session => {
      await keepLease(job, workerId, session);
      // Re-read after acquiring the account fences. A concurrent cancellation,
      // registration edit, follow change or opt-out must precede or follow us.
      const context = await loadNotificationContext(job, new Date(), { session });
      const channels = context ? await allowedChannels(job.userId, job.type, { session }) : [];
      if (!context || !channels.length) {
        return finish(job, workerId, 'skipped', context ? 'CHANNELS_DISABLED' : 'NO_LONGER_ELIGIBLE', session);
      }
      const existing = await Notification.findOne({ dedupeKey: job.key }).select('_id').session(session).lean();
      if (existing) return finish(job, workerId, 'done', null, session);
      const content = renderNotification(job.type, context);
      const [notification] = await Notification.create([{
        userId: job.userId, eventId: job.eventId ?? null,
        requestId: job.type === 'FRIEND_REQUEST' ? context.request._id : null,
        actorId: job.actorId ?? null, type: job.type,
        title: content.title, message: content.message, data: content.data, action: content.action,
        channels, dedupeKey: job.key, occurredAt: occurredAt(job, context),
      }], { session });
      for (const channel of channels.filter(value => EXTERNAL_CHANNELS.includes(value))) {
        if (channel !== 'push') await insertDelivery(notification, channel, null, job, session);
        else {
          // Tokens stay hidden. Ownership and device validity are checked again
          // by deliveryService immediately before the external provider call.
          const devices = await PushDevice.find({ userId: job.userId, active: true })
            .select('_id').session(session).lean();
          for (const device of devices) await insertDelivery(notification, channel, device._id, job, session);
        }
      }
      return finish(job, workerId, 'done', null, session);
    });
  } catch (error) {
    if (error instanceof AccountUnavailable) return finish(job, workerId, 'skipped', 'ACCOUNT_UNAVAILABLE');
    throw error;
  }
}

async function expandFanout(job, workerId) {
  if (!NOTIFICATION_TYPES.includes(job.type) || !validId(job.eventId)) return finish(job, workerId, 'failed', 'INVALID_JOB');
  const payload = object(job.payload);
  const recipients = [...new Set((Array.isArray(payload.recipientIds) ? payload.recipientIds : [])
    .filter(validId).map(String))];
  const event = await findEventById(job.eventId, { select: '_id hostId' });
  if (!event?.hostId || !recipients.length) return finish(job, workerId, 'skipped', 'EMPTY_AUDIENCE');
  try {
    return await withActiveAccounts([event.hostId], async session => {
      await keepLease(job, workerId, session);
      const activeRecipients = await User.find({ _id: { $in: recipients }, deletedAt: null })
        .select('_id').session(session).lean();
      const now = new Date();
      const operations = activeRecipients.map(user => {
        const key = notificationKey('recipient', job.key, user._id);
        return { updateOne: { filter: { key }, upsert: true, update: { $setOnInsert: {
          key, kind: 'notification', type: job.type, userId: user._id, eventId: job.eventId,
          ...(job.actorId ? { actorId: job.actorId } : {}), dueAt: job.dueAt, expiresAt: job.expiresAt ?? null,
          state: 'pending', attempts: 0, leaseOwner: null, leaseUntil: null, finishedAt: null,
          lastErrorCode: null, payload: object(payload.context), createdAt: now, updatedAt: now,
        } } } };
      });
      if (operations.length) await NotificationJob.bulkWrite(operations, { session, ordered: true, timestamps: false });
      return finish(job, workerId, 'done', null, session);
    });
  } catch (error) {
    if (error instanceof AccountUnavailable) return finish(job, workerId, 'skipped', 'ACCOUNT_UNAVAILABLE');
    throw error;
  }
}

async function requeue(job, workerId, result, { receipt = false } = {}) {
  const config = getNotificationConfig();
  const blocked = result.status === 'blocked';
  // Missing deployment credentials is not a failed send. Keep the durable job
  // resumable without spending its provider-attempt budget.
  const delay = blocked ? MINUTE : Math.max(1000, Math.min(24 * HOUR,
    Number(result.retryAfterMs) || Math.min(MINUTE, 1000 * 2 ** Math.min(job.attempts, 8))));
  if (!blocked && !receipt && job.attempts >= config.maxAttempts) {
    await markUnsentDelivery(job, 'failed', result.errorCode || 'MAX_ATTEMPTS');
    return finish(job, workerId, 'failed', result.errorCode || 'MAX_ATTEMPTS');
  }
  const next = new Date(Date.now() + delay);
  if (job.expiresAt != null && next.getTime() > instant(job.expiresAt)) {
    await markUnsentDelivery(job, 'skipped', 'OCCURRENCE_EXPIRED');
    return finish(job, workerId, 'skipped', 'OCCURRENCE_EXPIRED');
  }
  const update = { $set: {
    state: blocked ? 'blocked' : 'pending', dueAt: next, leaseOwner: null, leaseUntil: null,
    finishedAt: null, lastErrorCode: result.errorCode || (blocked ? 'PROVIDER_NOT_CONFIGURED' : 'RETRY'),
  } };
  if (blocked || receipt) update.$inc = { attempts: -1 };
  const saved = await NotificationJob.updateOne(owned(job, workerId), update);
  if (!saved.matchedCount) throw new LeaseLost();
  return blocked ? 'blocked' : 'retried';
}

async function processDelivery(job, workerId, receipt = false) {
  const id = object(job.payload).deliveryId;
  if (!validId(id)) return finish(job, workerId, 'failed', 'INVALID_DELIVERY');
  if (receipt && job.expiresAt != null && expired(job)) return finish(job, workerId, 'skipped', 'RECEIPT_EXPIRED');
  if (!receipt && expired(job)) {
    await markUnsentDelivery(job, 'skipped', 'OCCURRENCE_EXPIRED');
    return finish(job, workerId, 'skipped', 'OCCURRENCE_EXPIRED');
  }
  // Provider calls never execute inside an inbox/domain transaction.
  const result = receipt ? await deliveryService.checkPushReceipt(id)
    : await deliveryService.deliver(id, { jobKey: job.key, attempt: job.attempts });
  if (result.status === 'retry' || result.status === 'blocked') return requeue(job, workerId, result, { receipt });
  if (result.receiptPending) {
    const key = notificationKey('pushReceipt', id);
    const now = new Date();
    const delivery = await NotificationDelivery.findById(id).select('acceptedAt').lean();
    const acceptedAt = Number.isFinite(instant(delivery?.acceptedAt)) ? instant(delivery.acceptedAt) : now.getTime();
    await NotificationJob.updateOne({ key }, { $setOnInsert: {
      key, kind: 'pushReceipt', type: job.type, userId: job.userId, eventId: job.eventId,
      dueAt: new Date(Math.max(now.getTime(), acceptedAt + 15 * MINUTE)), expiresAt: new Date(acceptedAt + 24 * HOUR),
      payload: { deliveryId: String(id) }, state: 'pending',
    } }, { upsert: true, runValidators: true, setDefaultsOnInsert: true });
  }
  if (result.status === 'unknown') return finish(job, workerId, 'unknown', result.errorCode || 'OUTCOME_UNKNOWN');
  if (result.status === 'failed') return finish(job, workerId, 'failed', result.errorCode || 'DELIVERY_FAILED');
  if (result.status === 'skipped') return finish(job, workerId, 'skipped', result.errorCode || 'DELIVERY_SKIPPED');
  if (result.status !== 'accepted' && result.status !== 'delivered') throw new Error('Invalid notification delivery result.');
  return finish(job, workerId, 'done');
}

function errorCode(error) {
  if (error?.code === 11000) return 'DUPLICATE_KEY';
  return error?.name === 'ValidationError' || error?.name === 'CastError' ? 'INVALID_JOB' : 'JOB_PROCESSING_FAILED';
}

async function processDueJobs({ workerId = randomUUID(), limit, shouldStop } = {}) {
  const config = getNotificationConfig();
  const summary = { processed: 0, done: 0, skipped: 0, failed: 0, blocked: 0, unknown: 0, retried: 0, leaseLost: 0 };
  if (!config.workerEnabled) return summary;
  if (typeof workerId !== 'string' || !workerId || workerId.length > 100) throw new Error('Invalid notification worker identity.');
  const batch = Math.max(1, Math.min(100, Number.isSafeInteger(limit) ? limit : config.batchSize));
  for (let index = 0; index < batch; index++) {
    if (shouldStop?.()) break;
    const now = new Date();
    const job = await NotificationJob.findOneAndUpdate({
      dueAt: { $lte: now },
      $or: [{ state: 'pending' }, { state: 'blocked' }, { state: 'processing', leaseUntil: { $lte: now } }],
    }, { $set: { state: 'processing', leaseOwner: workerId, leaseUntil: new Date(now.getTime() + config.leaseMs) },
      $inc: { attempts: 1 } }, { new: true, sort: { dueAt: 1, _id: 1 } }).lean();
    if (!job) break;
    summary.processed++;
    try {
      let state;
      if (expired(job)) {
        await markUnsentDelivery(job, 'skipped', 'OCCURRENCE_EXPIRED');
        state = await finish(job, workerId, 'skipped', 'OCCURRENCE_EXPIRED');
      }
      else if (job.kind === 'fanout') state = await expandFanout(job, workerId);
      else if (job.kind === 'notification') state = await materialize(job, workerId);
      else if (job.kind === 'delivery' || job.kind === 'pushReceipt') state = await processDelivery(job, workerId, job.kind === 'pushReceipt');
      else state = await finish(job, workerId, 'failed', 'INVALID_JOB');
      summary[state]++;
    } catch (error) {
      if (error instanceof LeaseLost) { summary.leaseLost++; continue; }
      try {
        if (job.kind === 'delivery' && validId(object(job.payload).deliveryId)) {
          const delivery = await NotificationDelivery.findById(job.payload.deliveryId).select('status').lean();
          if (delivery && ['sending', 'unknown'].includes(delivery.status)) {
            await NotificationDelivery.updateOne({ _id: delivery._id, status: 'sending' }, {
              $set: { status: 'unknown', errorCode: 'SEND_OUTCOME_NOT_CONFIRMED' },
            });
            await finish(job, workerId, 'unknown', 'SEND_OUTCOME_NOT_CONFIRMED');
            summary.unknown++;
            continue;
          }
        }
        const state = await requeue(job, workerId, { status: 'retry', errorCode: errorCode(error) },
          { receipt: job.kind === 'pushReceipt' });
        summary[state]++;
      } catch (failure) {
        if (!(failure instanceof LeaseLost)) throw failure;
        summary.leaseLost++;
      }
    }
  }
  return summary;
}

// A bounded rotating scan repairs future schedules after deployment, restart or
// host edits. It never fabricates historical registration confirmations.
async function reconcileScheduledJobs({ shouldStop } = {}) {
  const config = getNotificationConfig();
  const summary = { scanned: 0, scheduled: 0, skipped: 0 };
  if (!config.workerEnabled) return summary;
  const limit = Math.min(500, config.batchSize * 5);
  // Exclude old history before applying the batch limit, so thousands of past
  // choices cannot delay newly edited events beyond their reminder grace window.
  const sources = collections.filter(entry => entry.storage !== 'archived');
  const rows = await withEventSnapshot(undefined, session => EventSelection.aggregate([
    { $match: {
      ...(reconciliationAfter ? { _id: { $gt: reconciliationAfter } } : {}),
      $or: [{ attending: true }, { interested: true }],
    } },
    ...sources.map(({ model }, index) => ({ $lookup: {
      from: model.collection.name, localField: 'eventId', foreignField: '_id',
      pipeline: [
        { $match: { endsAt: { $type: 'date', $gte: new Date(Date.now() - HOUR) }, status: { $nin: ['cancelled', 'archived', 'draft'] } } },
        { $project: { _id: 1, hostId: 1, endsAt: 1 } },
      ], as: 'eventSource' + index,
    } })),
    { $set: { scheduledEvent: { $concatArrays: sources.map((entry, index) => '$eventSource' + index) } } },
    { $unwind: '$scheduledEvent' }, { $sort: { _id: 1 } }, { $limit: limit },
  ]).session(session));
  for (const selection of rows) {
    if (shouldStop?.()) break;
    summary.scanned++;
    reconciliationAfter = selection._id;
    const event = selection.scheduledEvent;
    if (!event?.hostId || instant(event.endsAt) + HOUR < Date.now()) {
      summary.skipped++; continue;
    }
    try {
      const scheduled = await withActiveAccounts([selection.userId, event.hostId], async session => {
        const currentEvent = await findEventById(event._id, { session });
        const currentSelection = await EventSelection.findOne({ _id: selection._id, userId: selection.userId, eventId: event._id })
          .session(session).lean();
        if (!currentEvent || !currentSelection || (!currentSelection.attending && !currentSelection.interested)) {
          return null;
        }
        return scheduleSelectionNotifications(currentEvent, currentSelection, session, { now: new Date() });
      });
      if (scheduled == null) summary.skipped++;
      else summary.scheduled += scheduled;
    } catch (error) {
      if (!(error instanceof AccountUnavailable)) throw error;
      summary.skipped++;
    }
  }
  if (rows.length < limit) reconciliationAfter = null;
  return summary;
}

module.exports = { processDueJobs, reconcileScheduledJobs };
