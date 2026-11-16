const mongoose = require('mongoose');
const User = require('../../models/User');
const Friendship = require('../../models/Friendship');
const EventInvite = require('../../models/EventInvite');
const Notification = require('../../models/Notification');
const NotificationJob = require('../../models/NotificationJob');
const { friendRequestJob } = require('./friendRequestService');
const { notificationKey } = require('./keys');
const { loadNotificationContext, allowedChannels } = require('./policyService');
const { renderNotification } = require('./templates');

const id = value => String(value?._id ?? value);

// Backfill only actual pending social records. No friendship, invitation,
// provider delivery, or unrelated inbox read state is manufactured here.
async function candidateJobs(session) {
  const requests = await Friendship.find({ status: 'pending' }).session(session || null).lean();
  const invites = await EventInvite.find({ status: 'pending', read: { $ne: true } }).session(session || null).lean();
  return [...requests.map(request => friendRequestJob(request)), ...invites.map(invite => ({
    key: notificationKey('eventInvite', invite._id), kind: 'notification', type: 'EVENT_INVITE',
    userId: invite.recipientId, eventId: invite.eventId, actorId: invite.senderId, dueAt: invite.createdAt,
    payload: { inviteId: id(invite), occurredAt: new Date(invite.createdAt).toISOString() },
  }))];
}

async function plan({ now, session } = {}) {
  const current = new Date(now || Date.now());
  if (!Number.isFinite(current.getTime())) throw new Error('Social backfill requires a valid current instant.');
  const jobs = await candidateJobs(session);
  const rows = [];
  let ineligible = 0; let suppressed = 0; let existingInApp = 0;
  for (const job of jobs) {
    const context = await loadNotificationContext(job, current, { session });
    if (!context) { ineligible++; continue; }
    if (!(await allowedChannels(job.userId, job.type, { session })).includes('inApp')) { suppressed++; continue; }
    const existing = await Notification.findOne({ dedupeKey: job.key }).session(session || null).lean();
    if (existing?.channels?.includes('inApp')) existingInApp++;
    rows.push({ job, context, existing });
  }
  return { rows, now: current, summary: {
    pendingRecords: jobs.length, eligibleRecords: rows.length, ineligibleRecords: ineligible,
    suppressedByPreferences: suppressed, existingInAppNotifications: existingInApp,
    notificationsToAdd: rows.filter(row => !row.existing).length,
    externalOnlyNotificationsToExpose: rows.filter(row => row.existing && !row.existing.channels.includes('inApp')).length,
    pendingFriendRequests: rows.filter(row => row.job.type === 'FRIEND_REQUEST').map(({ job, context, existing }) => ({
      requestId: job.payload.requestId, requestVersion: job.payload.requestVersion,
      senderId: id(context.sender), sender: context.sender.username,
      recipientId: id(context.user), recipient: context.user.username,
      notificationExists: Boolean(existing?.channels?.includes('inApp')),
    })),
    pendingEventInvites: rows.filter(row => row.job.type === 'EVENT_INVITE').length,
    friendshipsCreated: 0, invitationsCreated: 0, externalDeliveriesCreated: 0,
  } };
}

async function previewSocialBackfill({ now = new Date() } = {}) {
  return (await plan({ now })).summary;
}

async function backfillSocialNotifications({ now = new Date() } = {}) {
  return mongoose.connection.transaction(async session => {
    // Use the same sorted account fence as normal social mutations and workers.
    const accounts = await User.find({ deletedAt: null }).select('_id').sort({ _id: 1 }).session(session).lean();
    for (const account of accounts) {
      const result = await User.updateOne({ _id: account._id, deletedAt: null },
        { $inc: { archiveWriteVersion: 1 } }, { session, timestamps: false });
      if (!result.matchedCount) throw new Error('A social-notification account became unavailable.');
    }
    const prepared = await plan({ now: new Date(Math.max(new Date(now).getTime(), Date.now())), session });
    let inserted = 0; let exposed = 0;
    for (const { job, context, existing } of prepared.rows) {
      if (existing) {
        if (!existing.channels.includes('inApp')) {
          await Notification.updateOne({ _id: existing._id }, { $addToSet: { channels: 'inApp' } }, { session });
          exposed++;
        }
        continue;
      }
      const content = renderNotification(job.type, context);
      await Notification.create([{
        userId: job.userId, eventId: job.eventId || null, actorId: job.actorId,
        requestId: job.type === 'FRIEND_REQUEST' ? context.request._id : null,
        type: job.type, title: content.title, message: content.message, data: content.data,
        action: content.action, channels: ['inApp'], dedupeKey: job.key,
        occurredAt: new Date(job.payload.occurredAt), isRead: false, readAt: null,
      }], { session });
      // Mark only newly provisioned jobs done. Existing leases/provider audit
      // state stay untouched; a worker sees the canonical notification key.
      await NotificationJob.updateOne({ key: job.key }, { $setOnInsert: {
        ...job, state: 'done', attempts: 0, finishedAt: prepared.now,
        leaseOwner: null, leaseUntil: null, expiresAt: null,
      } }, { upsert: true, session, runValidators: true });
      inserted++;
    }
    return { ...prepared.summary, notificationsAdded: inserted, notificationsExposedInApp: exposed,
      recipientInbox: await Notification.countDocuments({ userId: '6aeb4f6c9b286ace01de1aea',
        type: 'FRIEND_REQUEST', actorId: '6ae7ad81d75d3755e55f82d3', channels: 'inApp' }).session(session) };
  });
}

module.exports = { previewSocialBackfill, backfillSocialNotifications };
