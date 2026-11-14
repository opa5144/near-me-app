const { request } = require('./http');
const RETRYABLE = new Set(['MessageRateExceeded', 'ExpoError', 'ExpoServerError']);
function headers(config) {
  return { 'Content-Type': 'application/json', Accept: 'application/json',
    ...(config.accessToken ? { Authorization: `Bearer ${config.accessToken}` } : {}) };
}
function errorCode(value) {
  return typeof value === 'string' && /^[A-Za-z0-9_]{1,60}$/.test(value) ? 'EXPO_' + value : 'EXPO_REQUEST_REJECTED';
}
async function send({ to, content }, config) {
  if (!config.projectId || !config.accessToken) return { status: 'blocked', errorCode: 'EXPO_NOT_CONFIGURED' };
  const result = await request('https://exp.host/--/api/v2/push/send', {
    method: 'POST', headers: headers(config), body: JSON.stringify({
      to, title: content.pushTitle, body: content.pushBody,
      // Push needs routing data only; keep policy snapshots in the backend inbox.
      data: { eventId: content.data.eventId, type: content.data.type, action: content.action },
      sound: 'default', ttl: 3600,
    }),
  });
  if (result.uncertain || result.status >= 500) return { status: 'unknown', errorCode: 'EXPO_OUTCOME_UNKNOWN' };
  if (result.status === 429) return { status: 'retry', errorCode: 'EXPO_RATE_LIMIT', retryAfterMs: result.retryAfterMs };
  if ([401, 403].includes(result.status)) return { status: 'blocked', errorCode: 'EXPO_CREDENTIALS' };
  const ticket = Array.isArray(result.data?.data) ? result.data.data[0] : result.data?.data;
  if (result.ok && ticket?.status === 'ok' && typeof ticket.id === 'string') {
    return { status: 'accepted', messageId: ticket.id, receiptPending: true };
  }
  if (result.ok && ticket?.status !== 'error') return { status: 'unknown', errorCode: 'EXPO_OUTCOME_UNKNOWN' };
  const providerError = ticket?.details?.error;
  return { status: RETRYABLE.has(providerError) ? 'retry' : 'failed', errorCode: errorCode(providerError) };
}

async function receipt(messageId, config) {
  if (!config.projectId || !config.accessToken) return { status: 'blocked', errorCode: 'EXPO_NOT_CONFIGURED' };
  const result = await request('https://exp.host/--/api/v2/push/getReceipts', {
    method: 'POST', headers: headers(config), body: JSON.stringify({ ids: [messageId] }),
  });
  if (result.uncertain || result.status === 429 || result.status >= 500) {
    return { status: 'retry', errorCode: 'EXPO_RECEIPT_TEMPORARY', retryAfterMs: 60000 };
  }
  if ([401, 403].includes(result.status)) return { status: 'blocked', errorCode: 'EXPO_CREDENTIALS' };
  if (!result.ok) return { status: 'failed', errorCode: 'EXPO_RECEIPT_REJECTED' };
  const value = result.data?.data?.[messageId];
  if (!value) return { status: 'retry', errorCode: 'EXPO_RECEIPT_PENDING', retryAfterMs: 60000 };
  // An 'ok' receipt means FCM/APNs accepted it; it does not prove lock-screen display.
  if (value.status === 'ok') return { status: 'accepted', receiptPending: false };
  return { status: 'failed', errorCode: errorCode(value.details?.error) };
}
module.exports = { send, receipt };
