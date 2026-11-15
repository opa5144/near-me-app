// Readiness check only: no login, fixtures, worker jobs, provider calls, or API writes.
const path = require('node:path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env'), quiet: true });
process.env.NOTIFICATIONS_WORKER_ENABLED = 'false';
process.env.NOTIFICATIONS_EXTERNAL_DELIVERY_ENABLED = 'false';
const mongoose = require('mongoose');
const app = require('../src/index');
const { initializeNotificationModels } = require('../src/workers/notificationWorker');

async function main() {
  let server;
  const deadline = setTimeout(() => { console.error('Backend startup check timed out.'); process.exit(1); }, 45000);
  try {
    await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 10000, connectTimeoutMS: 8000 });
    await initializeNotificationModels();
    server = await new Promise((resolve, reject) => {
      const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
      listener.once('error', reject);
    });
    const root = 'http://127.0.0.1:' + server.address().port;
    const events = await fetch(root + '/api/events', { signal: AbortSignal.timeout(10000) });
    const body = await events.json();
    if (events.status !== 200 || !Array.isArray(body.events)) throw new Error('PublicEventsUnavailable');
    const invites = await fetch(root + '/api/events/invites/me', { signal: AbortSignal.timeout(10000) });
    if (invites.status !== 401) throw new Error('InviteAuthenticationUnavailable');
    console.log(JSON.stringify({ atlasConnected: true, serverStarted: true, eventsStatus: events.status,
      visibleEvents: body.events.length, unauthenticatedInviteStatus: invites.status, providerDeliveryEnabled: false }, null, 2));
  } catch (error) { console.error('Backend startup check failed:', error.name); process.exitCode = 1; }
  finally {
    if (server) await new Promise(resolve => server.close(resolve));
    await mongoose.disconnect(); clearTimeout(deadline);
  }
}
main();
