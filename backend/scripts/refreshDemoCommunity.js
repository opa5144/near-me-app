// Preview first. --apply performs the approved fixture import and notification repair.
// Domain rules live in services; this CLI owns configuration, snapshots and reporting.
const path = require('node:path');
const fs = require('node:fs/promises');
const { randomUUID } = require('node:crypto');
require('dotenv').config({ path: path.resolve(__dirname, '../.env'), quiet: true });
process.env.NOTIFICATIONS_WORKER_ENABLED = 'false';
process.env.NOTIFICATIONS_EXTERNAL_DELIVERY_ENABLED = 'false';
const mongoose = require('mongoose');
mongoose.set('autoCreate', false);
mongoose.set('autoIndex', false);
const { BSON } = mongoose.mongo;
const { previewDemoCommunity, populateDemoCommunity, previewNotificationRecipientRegistrations,
  registerNotificationRecipients } = require('../src/services/demoCommunityService');
const { previewNotificationRepair, repairNotifications } = require('../src/services/notifications/repairService');

const SNAPSHOT_COLLECTIONS = ['notifications', 'notificationJobs', 'notificationDeliveries', 'EventSelections'];
const ALL_COLLECTIONS = [...new Set(['AccountList', 'UserProfiles', 'AccountSecurity', 'eventList', 'PastEventsList', 'ArchivedEvents', 'EventPhotos',
  'EventSelections', 'eventRatings', ...SNAPSHOT_COLLECTIONS])];

async function saveSnapshot(db, runId) {
  const directory = path.resolve(__dirname, '../.local-backups');
  await fs.mkdir(directory, { recursive: true });
  const snapshot = { runId, savedAt: new Date(), collections: {} };
  // Preserve existing inbox/queue state and registration choices before writes.
  // Credentials/contact records are not copied into the private snapshot.
  for (const name of SNAPSHOT_COLLECTIONS) snapshot.collections[name] = await db.collection(name).find({}).toArray();
  const target = path.join(directory, 'community-notifications-' + runId + '.ejson');
  await fs.writeFile(target, BSON.EJSON.stringify(snapshot, { relaxed: false }), { flag: 'wx', mode: 0o600 });
  return { target, snapshot };
}

async function collectionCounts(db) {
  const counts = {};
  for (const name of ALL_COLLECTIONS) counts[name] = await db.collection(name).countDocuments({});
  return counts;
}

async function run(argv = process.argv.slice(2)) {
  const flags = new Set(argv);
  const apply = flags.has('--apply');
  const notificationsOnly = flags.has('--notifications-only');
  const communityOnly = flags.has('--community-only');
  const deadline = setTimeout(() => { console.error('Demo refresh timed out. Re-run its preview before retrying.'); process.exit(1); }, 10 * 60 * 1000);
  deadline.unref();
  try {
    if (argv.some(flag => !['--apply', '--notifications-only', '--community-only'].includes(flag)) ||
        (notificationsOnly && communityOnly)) throw new Error('UnsupportedRefreshOption');
    if (!process.env.MONGO_URI) throw new Error('MongoNotConfigured');
    await mongoose.connect(process.env.MONGO_URI, {
      serverSelectionTimeoutMS: 10000, connectTimeoutMS: 8000, socketTimeoutMS: 30000,
    });
    const db = mongoose.connection.db;
    const now = new Date();
    const before = await collectionCounts(db);
    const preview = {
      community: notificationsOnly ? null : await previewDemoCommunity({ now }),
      recipientRegistrations: notificationsOnly ? null : await previewNotificationRecipientRegistrations({ now }),
      notifications: communityOnly ? null : await previewNotificationRepair({ now }),
    };
    console.log(JSON.stringify({ mode: apply ? 'approved-apply-preflight' : 'read-only-preview', asOf: now, before, preview }, null, 2));
    if (!apply) return;

    const runId = now.toISOString().replace(/[:.]/g, '-') + '-' + randomUUID().slice(0, 8);
    const backup = await saveSnapshot(db, runId);
    console.log('Saved the existing notification records and queue state in a private, ignored snapshot.');
    const community = notificationsOnly ? null : await populateDemoCommunity({ now });
    const recipientRegistrations = notificationsOnly ? null : await registerNotificationRecipients({ now: new Date() });
    const notifications = communityOnly ? null : await repairNotifications({ now });
    const after = await collectionCounts(db);
    const report = { runId, completedAt: new Date(), before, after, community, recipientRegistrations, notifications };
    await fs.writeFile(path.join(path.dirname(backup.target), 'community-refresh-' + runId + '.json'),
      JSON.stringify(report, null, 2), { flag: 'wx', mode: 0o600 });
    console.log(JSON.stringify({ mode: 'applied', ...report }, null, 2));
  } catch (error) {
    // Never print Mongo URIs, credentials, provider errors or raw database documents.
    console.error('Demo refresh failed:', error.name, error.code && /^[A-Z0-9_]+$/.test(String(error.code)) ? error.code : '');
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
    clearTimeout(deadline);
  }
}

if (require.main === module) void run();
module.exports = { run };
