const Notification = require('../../models/Notification');
const User = require('../../models/User');
const { withActiveAccountWrite } = require('../activeAccountWrite');
const { ServiceError } = require('../serviceError');

function notificationDto(notification) {
  return {
    id: String(notification._id), eventId: String(notification.eventId),
    actorId: notification.actorId ? String(notification.actorId) : null,
    type: notification.type, title: notification.title, message: notification.message,
    data: notification.data ?? {}, action: notification.action ?? null,
    isRead: notification.isRead === true, readAt: notification.readAt ?? null,
    occurredAt: notification.occurredAt, createdAt: notification.createdAt,
  };
}

async function requireActiveReader(auth) {
  if (!(await User.exists({ _id: auth.userId, deletedAt: null }))) throw new ServiceError(401, 'Please log in again.');
}

function pagination(query) {
  if (!query || typeof query !== 'object' || Array.isArray(query) ||
      Object.keys(query).some(key => !['limit', 'cursor'].includes(key))) {
    throw new ServiceError(400, 'Use notification limit and cursor parameters only.');
  }
  if (query.limit !== undefined && (typeof query.limit !== 'string' || !/^(?:[1-9]|[1-9]\d|100)$/.test(query.limit))) {
    throw new ServiceError(400, 'Notification limit must be from 1 to 100.');
  }
  let cursor = null;
  if (query.cursor !== undefined) {
    try {
      if (typeof query.cursor !== 'string' || !/^[A-Za-z0-9_-]{1,512}$/.test(query.cursor)) throw new Error();
      const bytes = Buffer.from(query.cursor, 'base64url');
      if (bytes.toString('base64url') !== query.cursor) throw new Error();
      const decoded = JSON.parse(bytes.toString('utf8'));
      if (!decoded || Object.keys(decoded).sort().join(',') !== 'createdAt,id' ||
          typeof decoded.createdAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(decoded.createdAt) ||
          new Date(decoded.createdAt).toISOString() !== decoded.createdAt ||
          typeof decoded.id !== 'string' || !/^[a-f0-9]{24}$/i.test(decoded.id)) throw new Error();
      cursor = { createdAt: new Date(decoded.createdAt), id: decoded.id };
    } catch { throw new ServiceError(400, 'The notification cursor is invalid.'); }
  }
  return { limit: query.limit === undefined ? 20 : Number(query.limit), cursor };
}

async function listInbox(auth, query = {}) {
  const { limit, cursor } = pagination(query);
  await requireActiveReader(auth);
  // External-only source records never appear or count as unread in the inbox.
  const filter = { userId: auth.userId, channels: 'inApp' };
  if (cursor) filter.$or = [
    { createdAt: { $lt: cursor.createdAt } },
    { createdAt: cursor.createdAt, _id: { $lt: cursor.id } },
  ];
  const rows = await Notification.find(filter).sort({ createdAt: -1, _id: -1 }).limit(limit + 1).lean();
  const page = rows.slice(0, limit);
  const last = page[page.length - 1];
  const nextCursor = rows.length > limit && last ? Buffer.from(JSON.stringify({
    createdAt: last.createdAt.toISOString(), id: String(last._id),
  })).toString('base64url') : null;
  return { notifications: page.map(notificationDto), nextCursor };
}

async function unreadCount(auth) {
  await requireActiveReader(auth);
  return { unreadCount: await Notification.countDocuments({ userId: auth.userId, channels: 'inApp', isRead: { $ne: true } }) };
}

async function setRead(auth, id, body) {
  if (typeof id !== 'string' || !/^[a-f0-9]{24}$/i.test(id)) throw new ServiceError(400, 'Choose a valid notification.');
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length !== 1 || typeof body.read !== 'boolean') {
    throw new ServiceError(400, 'Submit read as true or false.');
  }
  await Notification.init();
  return withActiveAccountWrite(auth, [], async session => {
    const filter = { _id: id, userId: auth.userId, channels: 'inApp' };
    const current = await Notification.findOne(filter).session(session).lean();
    if (!current) throw new ServiceError(404, 'Notification not found.');
    if (current.isRead === body.read) return { notification: notificationDto(current) };
    const saved = await Notification.findOneAndUpdate(filter, { $set: {
      isRead: body.read, readAt: body.read ? new Date() : null,
    } }, { new: true, runValidators: true, session }).lean();
    return { notification: notificationDto(saved) };
  });
}

async function readAll(auth, body) {
  if (body !== undefined && (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length)) {
    throw new ServiceError(400, 'Marking all notifications read accepts no fields.');
  }
  await Notification.init();
  return withActiveAccountWrite(auth, [], async session => {
    const result = await Notification.updateMany({ userId: auth.userId, channels: 'inApp', isRead: { $ne: true } }, {
      $set: { isRead: true, readAt: new Date() },
    }, { session, runValidators: true });
    return { updatedCount: result.modifiedCount };
  });
}

module.exports = { listInbox, unreadCount, setRead, readAll };
