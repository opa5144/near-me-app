const mongoose = require('mongoose');
const QRCode = require('qrcode');
const Event = require('../models/Event');
const EventSelection = require('../models/EventSelection');
const QrCode = require('../models/QrCode');
const EventCheckInLimit = require('../models/EventCheckInLimit');
const User = require('../models/User');
const { findEvents, findEventById, withEventSnapshot } = require('../models/eventStore');
const { withActiveAccountWrite } = require('./activeAccountWrite');
const { ServiceError } = require('./serviceError');
const { toEventItem } = require('./eventData');
const { loadPhotoMetadata } = require('./photoCollectionService');
const { loadEventAudienceCounts } = require('./eventAudienceService');
const credentials = require('./ticketCredentials');
const { scheduleSelectionNotifications } = require('./notifications/triggerService');

const HOUR = 60 * 60 * 1000;
const LIMIT_WINDOW = 5 * 60 * 1000;
const PRIVATE_FIELDS = '+tokenHash +tokenEncrypted +codeLookup +codeEncrypted';
const idOf = value => String(value?._id ?? value);
const generation = value => Number.isSafeInteger(value) && value >= 0 ? value : 0;
const instant = value => value == null ? NaN : new Date(value).getTime();
const registrationFact = { $or: [{ attending: true }, { attended: true }, { registrationVersion: { $gt: 0 } }, { registeredAt: { $ne: null } }] };

function requireId(id) {
  if (typeof id !== 'string' || !/^[a-f0-9]{24}$/i.test(id)) throw new ServiceError(400, 'Invalid event ID.');
}

async function initializeTicketModels() {
  await QrCode.init();
  await EventCheckInLimit.init();
}

async function loadTicketModeLocks(eventIds, session) {
  if (!eventIds.length) return new Set();
  const query = EventSelection.distinct('eventId', { eventId: { $in: eventIds }, ...registrationFact });
  if (session) query.session(session);
  return new Set((await query).map(String));
}

async function validateTicketModeChange(before, after, session) {
  const locked = (await loadTicketModeLocks([before._id], session)).has(idOf(before));
  if (Boolean(before.useTickets) !== Boolean(after.useTickets) && locked) {
    throw new ServiceError(409, 'The ticket setting cannot change after someone has registered.', {
      errors: { useTickets: 'Ticket mode is locked after the first registration.' },
    });
  }
  if (after.useTickets) credentials.requireTicketConfiguration();
  return locked;
}

function available(event, now) {
  return event && (!event.status || event.status === 'published') && Number.isFinite(instant(event.startsAt)) &&
    instant(event.startsAt) < instant(event.endsAt) && instant(event.endsAt) > now.getTime();
}

// Called inside the same fenced transaction as registration/invitation acceptance.
// The host fence serializes issuance for an event; the unique indexes are the final
// defense against duplicate generation or manual-code collisions.
async function issueTicketForSelection(event, selection, session, { now = new Date() } = {}) {
  if (!session?.inTransaction()) throw new Error('Ticket issuance requires an active transaction.');
  if (!event.useTickets || !selection?.attending) return null;
  credentials.requireTicketConfiguration();
  const version = generation(selection.registrationVersion);
  const existing = await QrCode.findOne({ userId: selection.userId, eventId: event._id, registrationVersion: version })
    .select(PRIVATE_FIELDS).session(session).lean();
  if (existing) return existing;
  if (!available(event, now)) throw new ServiceError(409, 'This event is no longer issuing tickets.');
  let code;
  let lookup;
  for (let attempt = 0; attempt < 30; attempt++) {
    code = credentials.randomCode();
    lookup = credentials.codeLookup(event._id, code);
    if (!(await QrCode.exists({ eventId: event._id, codeLookup: lookup }).session(session))) break;
    code = null;
  }
  if (!code) throw new ServiceError(503, 'A ticket could not be generated. Please try again.');
  const ticketId = new mongoose.Types.ObjectId();
  const token = credentials.randomToken();
  const [created] = await QrCode.create([{
    _id: ticketId, userId: selection.userId, eventId: event._id, selectionId: selection._id,
    registrationVersion: version, keyVersion: 1,
    tokenHash: credentials.tokenHash(ticketId, token), tokenEncrypted: credentials.encrypt(token, ticketId, 'qr'),
    codeLookup: lookup, codeEncrypted: credentials.encrypt(code, ticketId, 'code'),
    expiresAt: event.endsAt, status: selection.attended ? 'used' : 'active', usedAt: selection.checkedInAt || null,
  }], { session });
  return created.toObject();
}

async function revokeSelectionTickets(selection, session, now = new Date()) {
  await QrCode.updateMany({ selectionId: selection._id, status: 'active' },
    { $set: { status: 'revoked', revokedAt: now } }, { session });
}

async function updateEventTickets(event, session) {
  if (!event.useTickets) return;
  if (['cancelled', 'archived'].includes(event.status)) {
    await QrCode.updateMany({ eventId: event._id, status: 'active' },
      { $set: { status: 'revoked', revokedAt: event.cancelledAt || event.archivedAt || new Date() } }, { session });
  } else {
    await QrCode.updateMany({ eventId: event._id, status: { $in: ['active', 'used'] } },
      { $set: { expiresAt: event.endsAt } }, { session });
  }
}

function ticketStatus(ticket, event, selection, now = new Date()) {
  if (!selection.attending || ['cancelled', 'archived', 'draft'].includes(event.status) || ticket?.status === 'revoked' ||
      ticket && generation(ticket.registrationVersion) !== generation(selection.registrationVersion)) return 'revoked';
  if (selection.attended) return 'used';
  return instant(event.endsAt) <= now.getTime() ? 'expired' : 'active';
}

async function serializeEvents(events, baseUrl, session) {
  const photos = await loadPhotoMetadata('event', events.map(event => event._id), session);
  const counts = await loadEventAudienceCounts(events.map(event => event._id), session);
  return new Map(events.map(event => [idOf(event), toEventItem({ ...event, ticketsModeLocked: true }, baseUrl,
    photos.get(idOf(event)) || [], counts.get(idOf(event)) || { interestedCount: 0, attendingCount: 0, checkedInCount: 0 })]));
}

// A ticket list contains no credentials. The individual owner-only POST below
// issues missing tickets lazily for pre-existing registrations and returns secrets.
async function listMyTickets(auth, baseUrl) {
  return withEventSnapshot(undefined, async session => {
    const selections = await EventSelection.find({ userId: auth.userId, attending: true }).sort({ registeredAt: -1, _id: -1 }).session(session).lean();
    const events = await findEvents({ _id: { $in: selections.map(selection => selection.eventId) }, useTickets: true, status: { $ne: 'draft' } }, {
      session, populate: { path: 'hostId', select: 'firstName lastName username', match: { deletedAt: null }, options: { session } },
    });
    const visible = events.filter(event => event.hostId);
    const byEvent = new Map(visible.map(event => [idOf(event), event]));
    const tickets = await QrCode.find({ userId: auth.userId, eventId: { $in: visible.map(event => event._id) } }).session(session).lean();
    const byGeneration = new Map(tickets.map(ticket => [idOf(ticket.eventId) + ':' + ticket.registrationVersion, ticket]));
    const items = await serializeEvents(visible, baseUrl, session);
    return selections.filter(selection => byEvent.has(idOf(selection.eventId))).map(selection => {
      const event = byEvent.get(idOf(selection.eventId));
      const ticket = byGeneration.get(idOf(event) + ':' + generation(selection.registrationVersion));
      return { id: ticket ? idOf(ticket) : null, event: items.get(idOf(event)), attended: Boolean(selection.attended),
        checkedInAt: selection.checkedInAt || null, status: ticketStatus(ticket, event, selection) };
    });
  });
}

async function getMyTicket(auth, eventId, body, baseUrl) {
  requireId(eventId);
  eventId = eventId.toLowerCase();
  if (body != null && (typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length)) {
    throw new ServiceError(400, 'No ticket details need to be submitted.');
  }
  await initializeTicketModels();
  const original = await findEventById(eventId, { select: '_id hostId' });
  if (!original?.hostId) throw new ServiceError(404, 'Event not found.');
  const result = await withActiveAccountWrite(auth, [original.hostId], async session => {
    const event = await findEventById(eventId, { session });
    if (!event || !event.useTickets || event.status === 'draft') throw new ServiceError(404, 'This event does not use tickets.');
    const selection = await EventSelection.findOne({ userId: auth.userId, eventId: event._id, attending: true }).session(session).lean();
    if (!selection) throw new ServiceError(404, 'Register for this event to view its ticket.');
    let ticket = await QrCode.findOne({ userId: auth.userId, eventId: event._id, registrationVersion: generation(selection.registrationVersion) })
      .select(PRIVATE_FIELDS).session(session).lean();
    if (!ticket) ticket = await issueTicketForSelection(event, selection, session);
    const ticketEvent = { ...event };
    await Event.populate(ticketEvent, { path: 'hostId', select: 'firstName lastName username', options: { session } });
    const items = await serializeEvents([ticketEvent], baseUrl, session);
    return { ticket, selection, event: items.get(eventId), status: ticketStatus(ticket, event, selection),
      opens: new Date(instant(event.startsAt) - HOUR), closes: new Date(event.endsAt) };
  });
  // QR rendering is CPU-only and stays outside the retryable database transaction.
  const token = credentials.decrypt(result.ticket.tokenEncrypted, result.ticket._id, 'qr');
  const code = credentials.decrypt(result.ticket.codeEncrypted, result.ticket._id, 'code');
  const payload = credentials.qrPayload(result.ticket._id, token);
  const qrCodeDataUrl = await QRCode.toDataURL(payload, { width: 320, margin: 2, errorCorrectionLevel: 'M' });
  return { event: result.event, ticket: {
    id: idOf(result.ticket), eventId, userId: idOf(auth.userId), registrationVersion: result.ticket.registrationVersion,
    code, qrPayload: payload, qrCodeDataUrl, status: result.status,
    checkInOpensAt: result.opens, checkInClosesAt: result.closes, checkedInAt: result.selection.checkedInAt || null,
  } };
}

function checkInInput(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length !== 1) {
    throw new ServiceError(400, 'Scan a QR ticket or enter its five-character code.');
  }
  if (Object.prototype.hasOwnProperty.call(body, 'code')) {
    const code = typeof body.code === 'string' ? body.code.trim().toUpperCase() : '';
    if (!/^[A-Z0-9]{5}$/.test(code)) throw new ServiceError(400, 'Enter five letters or numbers.', { errors: { code: 'Enter exactly five letters or numbers.' } });
    return { method: 'code', code };
  }
  const parsed = credentials.parseQrPayload(body.qrPayload);
  if (!parsed) throw new ServiceError(400, 'This QR code is not a valid event ticket.', { errors: { qrPayload: 'Scan a valid NearMe event ticket.' } });
  return { method: 'qr', ...parsed };
}

function assertHostCheckIn(event, auth, now) {
  if (!event) throw new ServiceError(404, 'Event not found.');
  if (idOf(event.hostId) !== idOf(auth.userId)) throw new ServiceError(403, 'Only this event’s host can check in attendees.');
  if (!event.useTickets) throw new ServiceError(409, 'This event does not require ticket check-in.');
  if (!available(event, now)) throw new ServiceError(409, 'Check-in is unavailable for this event.');
  if (now.getTime() < instant(event.startsAt) - HOUR) throw new ServiceError(409, 'Check-in opens one hour before this event starts.');
}

async function manualLimit(auth, eventId, now, session) {
  const limit = await EventCheckInLimit.findOne({ hostId: auth.userId, eventId }).session(session).lean();
  if (limit?.blockedUntil && instant(limit.blockedUntil) > now.getTime()) {
    const seconds = Math.max(1, Math.ceil((instant(limit.blockedUntil) - now.getTime()) / 1000));
    throw new ServiceError(429, 'Too many incorrect codes. Please wait before trying again.', { retryAfterSeconds: seconds,
      lockedUntil: limit.blockedUntil.toISOString(), errors: { code: 'Too many incorrect codes. Please wait before trying again.' } });
  }
  return limit;
}

async function failedManualCode(auth, eventId, now, limit, session) {
  const fresh = !limit || instant(limit.windowStartedAt) <= now.getTime() - LIMIT_WINDOW;
  const failedAttempts = fresh ? 1 : limit.failedAttempts + 1;
  const blockedUntil = failedAttempts >= 5 ? new Date(now.getTime() + LIMIT_WINDOW) : null;
  await EventCheckInLimit.updateOne({ hostId: auth.userId, eventId }, { $set: {
    failedAttempts, windowStartedAt: fresh ? now : limit.windowStartedAt, blockedUntil,
    expiresAt: new Date(now.getTime() + 24 * HOUR),
  }, $setOnInsert: { hostId: auth.userId, eventId } }, { session, upsert: true, runValidators: true });
  return blockedUntil;
}

async function checkIn(auth, eventId, body) {
  requireId(eventId);
  eventId = eventId.toLowerCase();
  const input = checkInInput(body);
  await initializeTicketModels();
  const original = await findEventById(eventId);
  assertHostCheckIn(original, auth, new Date());
  const filter = input.method === 'code' ? { eventId, codeLookup: credentials.codeLookup(eventId, input.code) }
    : { _id: input.ticketId, eventId, tokenHash: credentials.tokenHash(input.ticketId, input.token) };
  // Resolve the guest only after authenticating the event owner. The real check
  // repeats inside a host+guest account fence to race safely with cancellation.
  const candidate = await QrCode.findOne(filter).select('_id userId').lean();
  const result = await withActiveAccountWrite(auth, candidate ? [candidate.userId] : [], async session => {
    const now = new Date();
    const event = await findEventById(eventId, { session });
    assertHostCheckIn(event, auth, now);
    const limit = input.method === 'code' ? await manualLimit(auth, eventId, now, session) : null;
    const ticket = candidate ? await QrCode.findOne({ ...filter, _id: candidate._id }).select(PRIVATE_FIELDS).session(session).lean() : null;
    const selection = ticket ? await EventSelection.findOne({ _id: ticket.selectionId, userId: ticket.userId,
      eventId: event._id, attending: true }).session(session).lean() : null;
    const valid = ticket && selection && ['active', 'used'].includes(ticket.status) &&
      generation(ticket.registrationVersion) === generation(selection.registrationVersion) &&
      (input.method !== 'qr' || credentials.equalHash(ticket.tokenHash, credentials.tokenHash(ticket._id, input.token)));
    if (!valid) {
      // Return failure rather than throwing here, so the attempt counter commits.
      const blockedUntil = input.method === 'code' ? await failedManualCode(auth, eventId, now, limit, session) : null;
      return { invalid: true, blockedUntil };
    }
    if (ticket.status === 'used' && !selection.attended) return { invalid: true, blockedUntil: null };
    const alreadyCheckedIn = Boolean(selection.attended);
    const checkedInAt = alreadyCheckedIn ? selection.checkedInAt || ticket.usedAt : now;
    if (!alreadyCheckedIn) {
      const attendanceWrite = await EventSelection.updateOne({ _id: selection._id, attending: true, attended: { $ne: true } },
        { $set: { attended: true, checkedInAt: now, checkedInBy: auth.userId } }, { session, runValidators: true });
      const ticketWrite = await QrCode.updateOne({ _id: ticket._id, status: 'active' }, { $set: { status: 'used', usedAt: now } }, { session, runValidators: true });
      if (attendanceWrite.matchedCount !== 1 || ticketWrite.matchedCount !== 1) {
        throw new ServiceError(409, 'This registration changed. Please scan the ticket again.');
      }
      await scheduleSelectionNotifications(event, { ...selection, attended: true }, session, { now });
    }
    if (input.method === 'code') await EventCheckInLimit.deleteOne({ hostId: auth.userId, eventId }).session(session);
    const attendee = await User.findById(ticket.userId).select('_id firstName lastName username').session(session).lean();
    const counts = await loadEventAudienceCounts([event._id], session);
    return { alreadyCheckedIn, attended: true, eventId, checkedInAt,
      checkedInCount: counts.get(eventId)?.checkedInCount || 0,
      attendee: { id: idOf(attendee), username: attendee.username, firstName: attendee.firstName || '', lastName: attendee.lastName || '',
        name: [attendee.firstName, attendee.lastName].filter(Boolean).join(' ') || attendee.username } };
  });
  if (result.invalid) {
    const field = input.method === 'code' ? 'code' : 'qrPayload';
    if (result.blockedUntil) throw new ServiceError(429, 'Too many incorrect codes. Please wait five minutes.', {
      retryAfterSeconds: 300, lockedUntil: result.blockedUntil.toISOString(), errors: { code: 'Too many incorrect codes. Please wait five minutes.' },
    });
    throw new ServiceError(400, 'This ticket is invalid, cancelled, or belongs to another event.', {
      errors: { [field]: 'This ticket is invalid, cancelled, or belongs to another event.' },
    });
  }
  return result;
}

module.exports = { initializeTicketModels, loadTicketModeLocks, validateTicketModeChange, issueTicketForSelection,
  revokeSelectionTickets, updateEventTickets, getMyTicket, listMyTickets, checkIn };
