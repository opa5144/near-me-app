const { TIMED_TYPES } = require('../../constants/notificationTypes');
const { notificationOccurrence } = require('./timing');

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[character]));
}

const text = (value, maximum = 600) => typeof value === 'string' ? value.trim().slice(0, maximum) : '';
const iso = value => value == null || !Number.isFinite(new Date(value).getTime()) ? null : new Date(value).toISOString();

function dateLabel(value, timeZone) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return 'Unavailable';
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      month: '2-digit', day: '2-digit', year: 'numeric', timeZone: timeZone || 'UTC',
    }).formatToParts(date);
    const part = type => parts.find(item => item.type === type)?.value ?? '';
    return `${part('month')}/${part('day')}/${part('year').padStart(4, '0')}`;
  } catch { return 'Unavailable'; }
}

function clockLabel(value, timeZone) {
  try {
    return new Intl.DateTimeFormat('en-US', {
      hour: 'numeric', minute: '2-digit', timeZone: timeZone || 'UTC',
    }).format(new Date(value));
  } catch { return 'Unavailable'; }
}

// Keep policy metadata sufficient for a final send-time eligibility check, but
// never copy a recipient list, contact detail, token, or provider response into it.
function safePayload(payload) {
  const result = {};
  for (const key of ['expectedStartsAt', 'expectedEndsAt', 'expectedClosesAt', 'registrationVersion',
    'selectionVersion', 'eventVersion', 'occurredAt', 'changes', 'eventSnapshot', 'cancelledAt', 'cancellationReason', 'inviteId',
    'requestId', 'requestVersion', 'requestedAt']) {
    if (payload[key] !== undefined) result[key] = payload[key];
  }
  return result;
}

function renderNotification(type, context) {
  if (type === 'FRIEND_REQUEST') {
    const requestId = String(context.request._id);
    const actorId = String(context.sender._id);
    const name = text(`${context.sender.firstName || ''} ${context.sender.lastName || ''}`, 150) ||
      text(context.sender.username, 25) || 'Someone';
    return renderStoredNotification({ title: 'New friend request',
      message: `${name} (@${text(context.sender.username, 25)}) sent you a friend request.`,
      data: { type, requestId, actorId, requestVersion: context.payload.requestVersion,
        payload: safePayload(context.payload), dueAt: iso(notificationOccurrence(context.job)), expiresAt: null },
      action: { type: 'OPEN_FRIEND_REQUEST', requestId, actorId },
    });
  }
  const event = TIMED_TYPES.includes(type) ? context.event : context.eventSnapshot;
  const title = text(event.title, 150) || 'Your event';
  const zone = text(event.timeZone, 100) || text(context.event.timeZone, 100) || 'UTC';
  const start = `${dateLabel(event.startsAt, zone)} at ${clockLabel(event.startsAt, zone)} (${zone})`;
  const end = `${dateLabel(event.endsAt, zone)} at ${clockLabel(event.endsAt, zone)} (${zone})`;
  const venue = text(event.place, 300) || text(event.address, 500) || 'the saved event location';
  let heading;
  let message;
  switch (type) {
    case 'REGISTRATION_CONFIRMED':
      heading = 'Registration confirmed'; message = `Registration confirmed for ${title}. Event start: ${start}.`; break;
    case 'EVENT_INVITE':
      heading = 'Event invitation'; message = `${text(context.sender?.username, 25) || 'A friend'} invited you to ${title}, starting ${start}.`; break;
    case 'REGISTRATION_CANCELLED':
      heading = 'Registration cancelled'; message = `Your registration for ${title} has been cancelled.`; break;
    case 'EVENT_STARTS_24H':
      heading = '24-hour event reminder'; message = `${title} starts ${start} at ${venue}.`; break;
    case 'EVENT_STARTS_1H':
      heading = '1-hour event reminder'; message = `${title} starts ${start} at ${venue}.`; break;
    case 'EVENT_CANCELLED': {
      heading = 'Event cancelled';
      const reason = text(context.payload.cancellationReason ?? event.cancellationReason, 600);
      message = `${title} has been cancelled.${reason ? ' ' + reason : ''}`; break;
    }
    case 'EVENT_DATETIME_CHANGED':
      heading = 'Event schedule changed'; message = `The schedule for ${title} was updated. It starts ${start} and ends ${end}.`; break;
    case 'EVENT_LOCATION_CHANGED':
      heading = 'Event location changed'; message = `The location for ${title} was updated to ${venue}${event.address && event.address !== venue ? ', ' + text(event.address, 500) : ''}.`; break;
    case 'SAVED_EVENT_REGISTRATION_CLOSING': {
      heading = '24-hour registration reminder';
      const closes = event.registrationClosesAt ?? event.startsAt;
      message = `Registration for your saved event ${title} closes ${dateLabel(closes, zone)} at ${clockLabel(closes, zone)} (${zone}).`; break;
    }
    case 'FOLLOWED_ORGANIZER_NEW_EVENT': {
      heading = 'New event from an organizer you follow';
      const host = text(context.host.username, 25) || 'An organizer you follow';
      message = `${host} published ${title}, starting ${start}.`; break;
    }
    case 'RATE_ATTENDED_EVENT':
      heading = 'Rate your event experience'; message = `How was ${title}? Choose a rating to share your event experience.`; break;
    default:
      throw new Error('Unsupported notification type.');
  }
  const eventId = String(context.event._id);
  const data = {
    eventId, type, payload: safePayload(context.payload),
    ...(type === 'EVENT_INVITE' ? { inviteId: context.payload.inviteId } : {}),
    dueAt: iso(notificationOccurrence(context.job)), expiresAt: iso(context.job.expiresAt),
  };
  const action = { type: type === 'RATE_ATTENDED_EVENT' ? 'RATE_EVENT' : 'OPEN_EVENT', eventId };
  return renderStoredNotification({ title: heading, message, data, action });
}

// Retries render the already committed inbox wording rather than consulting an
// edited event again. Provider channels therefore describe the same occurrence.
function renderStoredNotification(notification) {
  const title = String(notification.title);
  const message = String(notification.message);
  return {
    title, message, data: notification.data, action: notification.action ?? null,
    emailSubject: title.replace(/[\r\n]+/g, ' '),
    emailHtml: `<h1>${escapeHtml(title)}</h1><p>${escapeHtml(message).replace(/\n/g, '<br>')}</p>`,
    emailText: message, smsText: message.slice(0, 600),
    pushTitle: title, pushBody: message.slice(0, 300),
  };
}

module.exports = { renderNotification, renderStoredNotification };
