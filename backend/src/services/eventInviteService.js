const EventInvite = require('../models/EventInvite');
const { findEvents, findEventById } = require('../models/eventStore');
const EventSelection = require('../models/EventSelection');
const Notification = require('../models/Notification');
const User = require('../models/User');
const { ServiceError } = require('./serviceError');
const { withActiveAccountWrite } = require('./activeAccountWrite');
const { writeEventSelection } = require('./eventSelectionService');
const { avatarUrlsForUsers } = require('./accountReadService');
const { loadPhotoMetadata } = require('./photoCollectionService');
const { toEventItem } = require('./eventData');
const { enqueueJob } = require('./notifications/triggerService');
const { notificationKey } = require('./notifications/keys');
const { areAcceptedFriends } = require('./friendshipAccess');

function requireId(value, label) {
  if (typeof value !== 'string' || !/^[a-f0-9]{24}$/i.test(value)) throw new ServiceError(400, 'Invalid ' + label + ' ID.');
}
function invitationOpen(event, now = new Date()) {
  const end = new Date(event.endsAt).getTime();
  const closes = new Date(event.registrationClosesAt || event.endsAt).getTime();
  return !['cancelled', 'archived', 'draft'].includes(event.status) && Number.isFinite(end) && Number.isFinite(closes) && end > now.getTime() && closes > now.getTime();
}
async function requireReader(auth) {
  if (!(await User.exists({ _id: auth.userId, deletedAt: null }))) throw new ServiceError(401, 'Please log in again.');
}

// Read canonical dates, split media and active identities rather than old inline fields.
async function inviteItems(rows, baseUrl) {
  const events = await findEvents({ _id: { $in: rows.map(row => row.eventId) }, status: { $ne: 'draft' } });
  const ids = [...new Set([...rows.map(row => String(row.senderId)), ...events.map(event => String(event.hostId))])];
  const users = await User.find({ _id: { $in: ids }, deletedAt: null }).select('_id firstName lastName username').lean();
  const accounts = new Map(users.map(user => [String(user._id), user]));
  const photos = await loadPhotoMetadata('event', events.map(event => event._id));
  const avatars = await avatarUrlsForUsers(ids, baseUrl);
  const byEvent = new Map(events.map(event => [String(event._id), event]));
  return rows.flatMap(row => {
    const event = byEvent.get(String(row.eventId));
    const sender = accounts.get(String(row.senderId));
    const host = event && accounts.get(String(event.hostId));
    if (!event || !sender || !host) return [];
    return [{ id: String(row._id), eventId: String(row.eventId), senderId: String(row.senderId), recipientId: String(row.recipientId),
      status: row.status, read: row.read === true, respondedAt: row.respondedAt ?? null, createdAt: row.createdAt,
      canRespond: row.status === 'pending' && invitationOpen(event),
      sender: { id: String(sender._id), username: sender.username, firstName: sender.firstName, lastName: sender.lastName, avatar: avatars.get(String(sender._id)) || '' },
      event: toEventItem({ ...event, hostId: host }, baseUrl, photos.get(String(event._id)) ?? []),
    }];
  });
}
async function getInvite(auth, inviteId, baseUrl) {
  requireId(inviteId, 'invitation'); await requireReader(auth);
  const row = await EventInvite.findOne({ _id: inviteId, recipientId: auth.userId }).lean();
  const invite = row && (await inviteItems([row], baseUrl))[0];
  if (!invite) throw new ServiceError(404, 'Invitation not found.');
  return { invite };
}
async function listInvites(auth, baseUrl) {
  await requireReader(auth);
  const rows = await EventInvite.find({ recipientId: auth.userId }).sort({ createdAt: -1, _id: -1 }).limit(30).lean();
  return { invites: await inviteItems(rows, baseUrl) };
}
async function sendInvite(auth, eventId, body, baseUrl) {
  requireId(eventId, 'event');
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(key => key !== 'recipientId')) throw new ServiceError(400, 'Provide the friend you want to invite.');
  requireId(body.recipientId, 'recipient');
  if (String(auth.userId).toLowerCase() === body.recipientId.toLowerCase()) throw new ServiceError(400, 'You cannot invite yourself.');
  const initial = await findEventById(eventId, { select: '_id hostId' });
  if (!initial) throw new ServiceError(404, 'Event not found.');
  await EventInvite.init();
  try {
    const row = await withActiveAccountWrite(auth, [body.recipientId, initial.hostId], async session => {
      const event = await findEventById(eventId, { session });
      const now = new Date();
      if (!event) throw new ServiceError(404, 'Event not found.');
      if (!invitationOpen(event, now)) throw new ServiceError(409, 'Invitations are closed for this event.');
      if (!(await areAcceptedFriends(auth.userId, body.recipientId, { session }))) throw new ServiceError(403, 'You can only invite accepted friends.');
      const filter = { eventId, senderId: auth.userId, recipientId: body.recipientId };
      const existing = await EventInvite.findOne(filter).session(session).lean();
      if (existing) return existing;
      const [invite] = await EventInvite.create([filter], { session });
      // Persist the invitation and outbox together; workers call providers later.
      await enqueueJob(session, { key: notificationKey('eventInvite', invite._id), kind: 'notification', type: 'EVENT_INVITE', userId: body.recipientId,
        eventId, actorId: auth.userId, dueAt: now, payload: { inviteId: String(invite._id), occurredAt: now.toISOString() } });
      return invite.toObject();
    });
    const invite = (await inviteItems([row], baseUrl))[0];
    if (!invite) throw new ServiceError(404, 'Invitation is unavailable.');
    return { invite };
  } catch (error) {
    if (error.code === 11000) throw new ServiceError(409, 'This invitation changed. Please refresh and try again.');
    throw error;
  }
}
async function updateInvite(auth, inviteId, body, baseUrl) {
  requireId(inviteId, 'invitation');
  if (!body || typeof body !== 'object' || Array.isArray(body) || !Object.keys(body).length || Object.keys(body).some(key => !['status', 'read'].includes(key)) ||
      (body.status !== undefined && !['accepted', 'declined'].includes(body.status)) || (body.read !== undefined && body.read !== true)) throw new ServiceError(400, 'Accept, decline, or mark this invitation read.');
  const initial = await EventInvite.findOne({ _id: inviteId, recipientId: auth.userId }).lean();
  if (!initial) throw new ServiceError(404, 'Invitation not found.');
  const initialEvent = await findEventById(initial.eventId, { select: '_id hostId' });
  if (!initialEvent) throw new ServiceError(404, 'Event not found.');
  await EventSelection.init();
  await withActiveAccountWrite(auth, [initial.senderId, initialEvent.hostId], async session => {
    const invite = await EventInvite.findOne({ _id: inviteId, recipientId: auth.userId }).session(session).lean();
    const event = await findEventById(initial.eventId, { session });
    if (!invite || !event) throw new ServiceError(404, 'Invitation not found.');
    const now = new Date();
    if (body.status && invite.status !== 'pending' && invite.status !== body.status) throw new ServiceError(409, 'You already responded to this invitation.');
    if (body.status === 'accepted' && invite.status === 'pending') {
      if (!(await areAcceptedFriends(initial.senderId, auth.userId, { session }))) throw new ServiceError(409, 'This invitation is no longer available.');
      if (!invitationOpen(event, now)) throw new ServiceError(409, 'Registration for this event has closed.');
      await writeEventSelection(auth.userId, event, { attending: true }, session, { now });
    }
    await EventInvite.updateOne({ _id: invite._id, recipientId: auth.userId }, { $set: { read: true,
      ...(body.status ? { status: body.status, respondedAt: invite.respondedAt || now } : {}) } }, { session, runValidators: true });
    await Notification.updateMany({ userId: auth.userId, type: 'EVENT_INVITE', 'data.inviteId': String(invite._id) }, { $set: { isRead: true, readAt: now } }, { session });
  });
  return getInvite(auth, inviteId, baseUrl);
}
module.exports = { sendInvite, listInvites, getInvite, updateInvite };
