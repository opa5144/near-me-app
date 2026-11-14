const { request } = require('./http');

async function send({ to, content }, config) {
  if (!/^AC[a-f0-9]{32}$/i.test(config.accountSid) || !config.authToken || (!config.from && !config.messagingServiceSid)) {
    return { status: 'blocked', errorCode: 'TWILIO_NOT_CONFIGURED' };
  }
  const body = new URLSearchParams({ To: to, Body: content.smsText });
  if (config.messagingServiceSid) body.set('MessagingServiceSid', config.messagingServiceSid);
  else body.set('From', config.from);
  const result = await request(`https://api.twilio.com/2010-04-01/Accounts/${config.accountSid}/Messages.json`, {
    method: 'POST', headers: {
      Authorization: 'Basic ' + Buffer.from(config.accountSid + ':' + config.authToken).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded',
    }, body: body.toString(),
  });
  // A timeout/5xx after posting may have accepted an SMS. Never blindly resend it.
  if (result.uncertain || result.status >= 500) return { status: 'unknown', errorCode: 'TWILIO_OUTCOME_UNKNOWN' };
  if (result.status === 429) return { status: 'retry', errorCode: 'TWILIO_RATE_LIMIT', retryAfterMs: result.retryAfterMs };
  if ([401, 403].includes(result.status)) return { status: 'blocked', errorCode: 'TWILIO_CREDENTIALS' };
  if (result.ok && typeof result.data?.sid === 'string') return { status: 'accepted', messageId: result.data.sid };
  if (result.ok) return { status: 'unknown', errorCode: 'TWILIO_OUTCOME_UNKNOWN' };
  const code = Number(result.data?.code);
  return { status: 'failed', errorCode: Number.isSafeInteger(code) ? `TWILIO_${code}` : 'TWILIO_REQUEST_REJECTED' };
}
module.exports = { send };
