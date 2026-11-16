// Preview by default. --apply runs only the approved store/history/social update.
// This entry point owns snapshots and reporting; services own all domain rules.
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
const { previewStoreHistoryPopulation, populateStoreHistory,
  provisionStoreHistoryIndexes } = require('../src/services/storeHistoryPopulationService');
const { previewSocialBackfill, backfillSocialNotifications } = require('../src/services/notifications/socialBackfillService');

const COLLECTIONS = ['StoreList', 'StorePhotos', 'EventSelections', 'friendships', 'eventinvites',
  'notifications', 'notificationJobs', 'notificationDeliveries'];

async function counts(db) {
  const result = {};
  for (const name of COLLECTIONS) result[name] = await db.collection(name).countDocuments({});
  return result;
}

async function saveSnapshot(db, runId) {
  const directory = path.resolve(__dirname, '../.local-backups');
  await fs.mkdir(directory, { recursive: true });
  const collections = {};
  for (const name of COLLECTIONS) collections[name] = await db.collection(name).find({}).toArray();
  const target = path.join(directory, 'stores-history-social-' + runId + '.ejson');
  await fs.writeFile(target, BSON.EJSON.stringify({ runId, savedAt: new Date(), collections }, { relaxed: false }),
    { flag: 'wx', mode: 0o600 });
  return { directory, target };
}

async function main(argv = process.argv.slice(2)) {
  const options = new Set(argv);
  const apply = options.has('--apply');
  const dataOnly = options.has('--data-only');
  const socialOnly = options.has('--social-only');
  const deadline = setTimeout(() => { console.error('Store/history update timed out. Preview its current state before retrying.'); process.exit(1); }, 10 * 60 * 1000);
  deadline.unref();
  try {
    if (argv.some(option => !['--apply', '--data-only', '--social-only'].includes(option)) || (dataOnly && socialOnly)) {
      throw new Error('UnsupportedPopulationOption');
    }
    if (!process.env.MONGO_URI) throw new Error('MongoNotConfigured');
    await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 10000, connectTimeoutMS: 8000, socketTimeoutMS: 30000 });
    const db = mongoose.connection.db;
    const before = await counts(db);
    const now = new Date();
    const preview = {
      data: socialOnly ? null : await previewStoreHistoryPopulation({ now }),
      social: dataOnly ? null : await previewSocialBackfill({ now }),
    };
    console.log(JSON.stringify({ mode: apply ? 'approved-apply-preflight' : 'read-only-preview', asOf: now, before, preview }, null, 2));
    if (!apply) return;

    const runId = now.toISOString().replace(/[:.]/g, '-') + '-' + randomUUID().slice(0, 8);
    const snapshot = await saveSnapshot(db, runId);
    console.log('Saved the existing stores, media, selections, and social notification state in a private, ignored snapshot.');
    if (!socialOnly) await provisionStoreHistoryIndexes();
    const data = socialOnly ? null : await populateStoreHistory({ now: new Date() });
    const social = dataOnly ? null : await backfillSocialNotifications({ now: new Date() });
    const report = { runId, completedAt: new Date(), before, after: await counts(db), data, social };
    await fs.writeFile(path.join(snapshot.directory, 'stores-history-social-' + runId + '.json'),
      JSON.stringify(report, null, 2), { flag: 'wx', mode: 0o600 });
    console.log(JSON.stringify({ mode: 'applied', ...report }, null, 2));
  } catch (error) {
    console.error('Store/history/social update failed:', error.name,
      /^[A-Z0-9_]+$/.test(String(error.code || '')) ? error.code : '');
    if (error.name === 'StoreHistoryPopulationError') console.error(error.message);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
    clearTimeout(deadline);
  }
}

if (require.main === module) void main();
module.exports = { main };
