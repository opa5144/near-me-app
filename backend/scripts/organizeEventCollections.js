// Preview by default. --apply performs only the approved physical event moves;
// domain rules live in eventLifecycleService, not in this administrative CLI.
const path = require('node:path');
const fs = require('node:fs/promises');
const { randomUUID } = require('node:crypto');
require('dotenv').config({ path: path.resolve(__dirname, '../.env'), quiet: true });
process.env.NOTIFICATIONS_WORKER_ENABLED = 'false';
process.env.NOTIFICATIONS_EXTERNAL_DELIVERY_ENABLED = 'false';
process.env.EVENT_LIFECYCLE_WORKER_ENABLED = 'false';
const mongoose = require('mongoose');
mongoose.set('autoCreate', false);
mongoose.set('autoIndex', false);
const { collections } = require('../src/models/eventStore');
const { previewEventLifecycle, reconcileEventLifecycle } = require('../src/services/eventLifecycleService');

async function snapshotEvents(db, runId) {
  const directory = path.resolve(__dirname, '../.local-backups');
  await fs.mkdir(directory, { recursive: true });
  const saved = {};
  for (const { model } of collections) saved[model.collection.name] = await db.collection(model.collection.name).find({}).toArray();
  const target = path.join(directory, `event-lifecycle-${runId}.ejson`);
  await fs.writeFile(target, mongoose.mongo.BSON.EJSON.stringify({ runId, savedAt: new Date(), collections: saved }, { relaxed: false }),
    { flag: 'wx', mode: 0o600 });
  return directory;
}

async function provisionCollections() {
  // Pre-create the destinations and indexes outside the per-event transactions.
  for (const { model } of collections) {
    try { await model.createCollection(); }
    catch (error) { if (error.code !== 48 && error.codeName !== 'NamespaceExists') throw error; }
    await model.createIndexes();
  }
}

async function main(argv = process.argv.slice(2)) {
  const apply = argv.includes('--apply');
  const deadline = setTimeout(() => {
    console.error('Event organization timed out. Run its preview before retrying.');
    process.exit(1);
  }, 10 * 60 * 1000);
  deadline.unref();
  try {
    if (argv.some(flag => flag !== '--apply')) throw new Error('UnsupportedEventOrganizationOption');
    if (!process.env.MONGO_URI) throw new Error('MongoNotConfigured');
    await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 10000, connectTimeoutMS: 8000, socketTimeoutMS: 30000 });
    const before = await previewEventLifecycle();
    console.log(JSON.stringify({ mode: apply ? 'apply-preflight' : 'read-only-preview', asOf: new Date(), before }, null, 2));
    if (!apply) return;
    if (before.conflicts) throw new Error('EventCollectionIdentityConflict');
    const runId = new Date().toISOString().replace(/[:.]/g, '-') + '-' + randomUUID().slice(0, 8);
    const directory = await snapshotEvents(mongoose.connection.db, runId);
    console.log('Saved existing event metadata in a private, ignored snapshot. Photos and participation records remain in place.');
    await provisionCollections();
    const moved = { scanned: 0, movedToPast: 0, movedToArchived: 0, skipped: 0 };
    // Each transaction rereads its source and checks the destination. No ID,
    // timestamp, image, attendance choice, rating or notification is replaced.
    for (let batch = 0; batch < 1000; batch++) {
      const result = await reconcileEventLifecycle({ limit: 100 });
      for (const field of Object.keys(moved)) moved[field] += result[field];
      if (result.scanned < 100 || result.movedToPast + result.movedToArchived === 0) break;
      if (batch === 999) throw new Error('EventOrganizationBatchLimit');
    }
    const after = await previewEventLifecycle();
    const report = { runId, completedAt: new Date(), before, after, moved,
      unchanged: ['EventPhotos', 'EventSelections', 'eventRatings', 'eventinvites', 'notifications', 'notificationJobs', 'notificationDeliveries'] };
    await fs.writeFile(path.join(directory, `event-lifecycle-${runId}.json`), JSON.stringify(report, null, 2), { flag: 'wx', mode: 0o600 });
    console.log(JSON.stringify({ mode: 'applied', ...report }, null, 2));
  } catch (error) {
    // Raw Mongo error messages can contain configuration or documents.
    console.error('Event organization failed:', error.name,
      /^[A-Z0-9_]+$/.test(String(error.code || '')) ? error.code : '');
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
    clearTimeout(deadline);
  }
}

if (require.main === module) void main();
module.exports = { main };
