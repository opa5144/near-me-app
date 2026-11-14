const { request } = require('./http');

async function send({ to, content, key }, config) {
  if (!config.apiKey || !config.from) return { status: 'blocked', errorCode: 'RESEND_NOT_CONFIGURED' };
  const result = await request('https://api.resend.com/emails', {
    method: 'POST', headers: { Authorization: `Bearer ${config.apiKey}`, 'Content-Type': 'application/json', 'Idempotency-Key': key },
    body: JSON.stringify({ from: config.from, to: [to], subject: content.emailSubject, html: content.emailHtml, text: content.emailText }),
  });
  // Resend retains idempotency keys for 24h; the bounded retry schedule stays inside it.
  if (result.uncertain || result.status >= 500 || result.status === 429 ||
      result.data?.name === 'concurrent_idempotent_requests') {
    return { status: 'retry', errorCode: 'RESEND_TEMPORARY', retryAfterMs: result.retryAfterMs || 30000 };
  }
  if ([401, 403].includes(result.status)) return { status: 'blocked', errorCode: 'RESEND_CREDENTIALS' };
  // A changed sender/contact after an uncertain attempt may conflict with the
  // original idempotent request. Retain it for review rather than resend.
  if (result.status === 409) return { status: 'unknown', errorCode: 'RESEND_IDEMPOTENCY_CONFLICT' };
  if (result.ok && typeof result.data?.id === 'string') return { status: 'accepted', messageId: result.data.id };
  if (result.ok) return { status: 'retry', errorCode: 'RESEND_OUTCOME_UNCONFIRMED', retryAfterMs: 30000 };
  return { status: 'failed', errorCode: 'RESEND_REQUEST_REJECTED' };
}
module.exports = { send };
