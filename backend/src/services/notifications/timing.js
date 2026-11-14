const HOUR = 60 * 60 * 1000;
const ANCHORS = Object.freeze({
  EVENT_STARTS_24H: ['expectedStartsAt', -24 * HOUR],
  EVENT_STARTS_1H: ['expectedStartsAt', -HOUR],
  SAVED_EVENT_REGISTRATION_CLOSING: ['expectedClosesAt', -24 * HOUR],
  RATE_ATTENDED_EVENT: ['expectedEndsAt', HOUR],
});

// Retry dueAt is mutable queue state. The notification's occurrence is the
// original schedule anchor, or the immutable committed time of an immediate fact.
function notificationOccurrence(job) {
  const payload = job.payload ?? {};
  const context = payload.context ?? {};
  const anchor = ANCHORS[job.type];
  const value = anchor ? payload[anchor[0]] : payload.occurredAt ?? context.occurredAt ?? job.createdAt ?? job.dueAt;
  const instant = value == null ? NaN : new Date(value).getTime();
  return Number.isFinite(instant) ? new Date(instant + (anchor?.[1] ?? 0)) : null;
}

module.exports = { notificationOccurrence };
