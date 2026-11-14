// Read lazily: importing the app/config must not start a worker or send a message.
function positiveInteger(value, fallback, minimum, maximum) {
  if (value === undefined || value === '') return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error('Invalid notification worker configuration.');
  }
  return parsed;
}

function getNotificationConfig() {
  return {
    workerEnabled: process.env.NOTIFICATIONS_WORKER_ENABLED !== 'false',
    // Provider adapters are ready, but live outbound traffic is an explicit deployment choice.
    externalEnabled: process.env.NOTIFICATIONS_EXTERNAL_DELIVERY_ENABLED === 'true',
    pollMs: positiveInteger(process.env.NOTIFICATIONS_POLL_MS, 5000, 1000, 60000),
    batchSize: positiveInteger(process.env.NOTIFICATIONS_BATCH_SIZE, 20, 1, 100),
    leaseMs: positiveInteger(process.env.NOTIFICATIONS_LEASE_MS, 120000, 60000, 600000),
    graceMs: positiveInteger(process.env.NOTIFICATIONS_REMINDER_GRACE_MS, 120000, 1000, 300000),
    maxAttempts: positiveInteger(process.env.NOTIFICATIONS_MAX_ATTEMPTS, 5, 1, 10),
    resend: { apiKey: process.env.RESEND_API_KEY || '', from: process.env.NOTIFICATION_EMAIL_FROM || '' },
    twilio: {
      accountSid: process.env.TWILIO_ACCOUNT_SID || '', authToken: process.env.TWILIO_AUTH_TOKEN || '',
      from: process.env.TWILIO_FROM_NUMBER || '', messagingServiceSid: process.env.TWILIO_MESSAGING_SERVICE_SID || '',
    },
    expo: { accessToken: process.env.EXPO_ACCESS_TOKEN || '',
      projectId: (process.env.EXPO_PROJECT_ID || '').trim().toLowerCase() },
  };
}
module.exports = { getNotificationConfig };
