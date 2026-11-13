// Administrative cleanup of approved top-level fields after the split-collection cutover.
// Uses the native driver only: no app startup, Mongoose defaults, or automatic index changes.
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { createHash, randomUUID } = require('node:crypto');
const { MongoClient, BSON, ObjectId } = require('mongodb');

const FIELDS = Object.freeze({
  AccountList: Object.freeze([
    'passwordHash', 'authVersion', 'mfaEnabled', 'mfaSecretEncrypted',
    'mfaRecoveryCodeHashes', 'mfaLastUsedStep', 'mfaFailedAttempts', 'mfaLockedUntil',
    'securityPasswordFailedAttempts', 'securityPasswordLockedUntil',
    'loginPasswordFailedAttempts', 'loginPasswordLockedUntil',
    'phone', 'bio', 'dob', 'avatarData', 'avatarMimeType', 'avatarUrl',
  ]),
  eventList: Object.freeze(['photos', 'imageData', 'imageMimeType']),
  StoreList: Object.freeze(['photos', 'imageData', 'imageMimeType']),
});
const DESTINATIONS = ['UserProfiles', 'AccountSecurity', 'UserAvatars', 'EventPhotos', 'StorePhotos'];
const BSON_OPTIONS = { promoteValues: false, promoteBuffers: false };
const TRANSACTION_OPTIONS = {
  readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' }, readPreference: 'primary',
};
const has = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
const sha256 = data => createHash('sha256').update(data).digest('hex');
const operation = { stage: 'starting', commitStatus: 'not-started', backupPath: null };

class CleanupError extends Error {
  constructor(message) { super(message); this.name = 'LegacyFieldCleanupError'; }
}

function canonical(value) {
  function sort(item) {
    if (Array.isArray(item)) return item.map(sort);
    if (item && typeof item === 'object') {
      return Object.fromEntries(Object.keys(item).sort().map(key => [key, sort(item[key])]));
    }
    return item;
  }
  return JSON.stringify(sort(BSON.EJSON.serialize(value, { relaxed: false })));
}

function fingerprint(documents) {
  const hash = createHash('sha256');
  for (const document of documents) hash.update(BSON.serialize(document));
  return hash.digest('hex');
}

function binary(value) {
  if (Buffer.isBuffer(value)) return value;
  if (value?._bsontype === 'Binary') return Buffer.from(value.value(true));
  return null;
}

function integer(value) {
  return typeof value === 'number' ? value : Number(value?.toString());
}

async function metadata(db) {
  const listed = await db.listCollections({}, { nameOnly: false }).toArray();
  const result = {};
  for (const info of listed.sort((a, b) => a.name.localeCompare(b.name))) {
    if (info.type !== 'collection') throw new CleanupError('Unexpected database object; cleanup stopped.');
    result[info.name] = {
      options: info.options, uuid: info.info?.uuid,
      indexes: (await db.collection(info.name).indexes()).sort((a, b) => a.name.localeCompare(b.name)),
    };
  }
  for (const name of [...Object.keys(FIELDS), ...DESTINATIONS]) {
    if (!has(result, name)) throw new CleanupError('An expected collection is missing; cleanup stopped.');
  }
  return result;
}

async function readDocuments(db, name, session) {
  return db.collection(name).find({}, { ...BSON_OPTIONS, ...(session ? { session } : {}) })
    .sort({ _id: 1 }).toArray();
}

async function snapshot(db, names, session) {
  const result = {};
  // Transaction-bound operations must remain sequential on a MongoDB session.
  for (const name of names) result[name] = await readDocuments(db, name, session);
  return result;
}

async function readSnapshot(client, db, names) {
  const session = client.startSession();
  try {
    let result;
    await session.withTransaction(async () => { result = await snapshot(db, names, session); }, TRANSACTION_OPTIONS);
    return result;
  } finally { await session.endSession(); }
}

function grouped(documents, field) {
  const result = new Map();
  for (const document of documents) {
    if (!(document._id instanceof ObjectId) || !(document[field] instanceof ObjectId)) {
      throw new CleanupError('A destination has an invalid identifier; cleanup stopped.');
    }
    const key = String(document[field]);
    const group = result.get(key) ?? [];
    group.push(document);
    result.set(key, group);
  }
  return result;
}

// Destination values are authoritative and may have changed since the historical copy.
// Check coverage and usable payloads, never copy stale original values back into them.
function verifyCoverage(data) {
  const profiles = grouped(data.UserProfiles, 'userId');
  const security = grouped(data.AccountSecurity, 'userId');
  const avatars = grouped(data.UserAvatars, 'userId');
  const accountIds = new Set(data.AccountList.map(account => String(account._id)));
  for (const group of [profiles, security, avatars]) {
    for (const [id, records] of group) {
      if (!accountIds.has(id) || records.length !== 1) {
        throw new CleanupError('An account destination is orphaned or duplicated; cleanup stopped.');
      }
    }
  }
  for (const account of data.AccountList) {
    const id = String(account._id);
    const profile = profiles.get(id)?.[0];
    const credentials = security.get(id)?.[0];
    if (!profile || ['phone', 'bio', 'dob'].some(field => typeof profile[field] !== 'string')) {
      throw new CleanupError('An account lacks its authoritative profile fields; cleanup stopped.');
    }
    if (!credentials || typeof credentials.passwordHash !== 'string' || !credentials.passwordHash ||
        !Number.isSafeInteger(integer(credentials.authVersion)) || integer(credentials.authVersion) < 0 ||
        typeof credentials.mfaEnabled !== 'boolean' ||
        (credentials.mfaEnabled && !credentials.mfaSecretEncrypted)) {
      throw new CleanupError('An account lacks usable authoritative security data; cleanup stopped.');
    }
    const oldAvatar = binary(account.avatarData);
    if (account.avatarData != null && !oldAvatar) {
      throw new CleanupError('An old avatar has an unexpected type; cleanup stopped.');
    }
    const avatar = avatars.get(id)?.[0];
    if ((oldAvatar?.length || account.avatarUrl) && !avatar) {
      throw new CleanupError('An old avatar has no authoritative replacement; cleanup stopped.');
    }
    if (avatar && (!binary(avatar.avatarData)?.length || typeof avatar.avatarMimeType !== 'string' || !avatar.avatarMimeType)) {
      throw new CleanupError('An authoritative avatar has no usable image; cleanup stopped.');
    }
  }
  for (const [source, target, parentField] of [
    ['eventList', 'EventPhotos', 'eventId'], ['StoreList', 'StorePhotos', 'storeId'],
  ]) {
    const groups = grouped(data[target], parentField);
    const parentIds = new Set(data[source].map(resource => String(resource._id)));
    for (const [id, photos] of groups) {
      if (!parentIds.has(id) || photos.length > 5) {
        throw new CleanupError('Photo destinations have an invalid parent or count; cleanup stopped.');
      }
      photos.sort((a, b) => integer(a.displayOrder) - integer(b.displayOrder));
      for (let order = 0; order < photos.length; order++) {
        const photo = photos[order];
        const bytes = binary(photo.imageData);
        if (integer(photo.displayOrder) !== order || !bytes?.length || bytes.length > 1024 * 1024 ||
            photo.imageMimeType !== 'image/jpeg') {
          throw new CleanupError('A photo destination has invalid order or image data; cleanup stopped.');
        }
      }
    }
    for (const resource of data[source]) {
      if (resource.photos != null && !Array.isArray(resource.photos)) {
        throw new CleanupError('Old embedded photos have an unexpected type; cleanup stopped.');
      }
      const oldImage = binary(resource.imageData);
      if (resource.imageData != null && !oldImage) {
        throw new CleanupError('An old photo has an unexpected type; cleanup stopped.');
      }
      if ((resource.photos?.length || oldImage?.length) && !groups.get(String(resource._id))?.length) {
        throw new CleanupError('Old photo data has no authoritative replacement; cleanup stopped.');
      }
    }
  }
}

function stripped(name, document) {
  const copy = { ...document };
  for (const field of FIELDS[name] ?? []) delete copy[field];
  return copy;
}

function plan(data) {
  return Object.fromEntries(Object.entries(FIELDS).map(([name, fields]) => [name, {
    documents: data[name].length,
    documentsToClean: data[name].filter(document => fields.some(field => has(document, field))).length,
    fieldOccurrences: Object.fromEntries(fields.map(field => [field, data[name].filter(document => has(document, field)).length])),
  }]));
}

function assertSnapshot(actual, expected, names, stripLegacy = false) {
  for (const name of names) {
    const wanted = stripLegacy ? expected[name].map(document => stripped(name, document)) : expected[name];
    if (fingerprint(actual[name]) !== fingerprint(wanted)) {
      throw new CleanupError('A collection differs from the expected snapshot; inspect the backup and report before continuing.');
    }
  }
}

function protectBackup(root, directory) {
  if (process.platform !== 'win32') return;
  if (!directory.startsWith(root + path.sep)) throw new CleanupError('Invalid private backup directory.');
  try {
    const identity = execFileSync('whoami.exe', ['/user', '/fo', 'csv', '/nh'], { encoding: 'utf8', windowsHide: true });
    const sid = identity.match(/S-\d+(?:-\d+)+/)?.[0];
    if (!sid) throw new Error('Missing user identity.');
    for (const target of [root, directory]) {
      execFileSync('icacls.exe', [target, '/inheritance:r', '/grant:r',
        '*' + sid + ':(OI)(CI)F', '*S-1-5-18:(OI)(CI)F', '*S-1-5-32-544:(OI)(CI)F'],
      { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    }
  } catch { throw new CleanupError('Private backup permissions could not be applied; no data was exported or changed.'); }
}

function writePrivate(filename, contents) {
  const descriptor = fs.openSync(filename, 'wx', 0o600);
  try { fs.writeFileSync(descriptor, contents); fs.fsyncSync(descriptor); }
  finally { fs.closeSync(descriptor); }
}

function backup(data, collectionMetadata, database, prefix = 'legacy-cleanup') {
  if (!['legacy-cleanup', 'category-events-import', 'event-categories-venues'].includes(prefix)) {
    throw new CleanupError('This private backup operation is not allowlisted.');
  }
  const root = path.resolve(__dirname, '../.local-backups');
  const ignoreFile = fs.readFileSync(path.resolve(__dirname, '../../.gitignore'), 'utf8');
  if (!ignoreFile.split(/\r?\n/).includes('backend/.local-backups/')) {
    throw new CleanupError('The private backup directory must be excluded from Git.');
  }
  fs.mkdirSync(root, { recursive: true, mode: 0o700 });
  if (fs.lstatSync(root).isSymbolicLink()) throw new CleanupError('The private backup directory cannot be a link.');
  const directory = path.join(root, prefix + '-' + new Date().toISOString().replace(/[:.]/g, '-') + '-' + randomUUID());
  fs.mkdirSync(directory, { mode: 0o700 });
  protectBackup(root, directory);
  const collections = [];
  for (const [name, documents] of Object.entries(data)) {
    const filename = String(collections.length).padStart(3, '0') + '.bson';
    const contents = Buffer.concat(documents.map(document => BSON.serialize(document)));
    writePrivate(path.join(directory, filename), contents);
    const persisted = fs.readFileSync(path.join(directory, filename));
    if (!persisted.equals(contents)) throw new CleanupError('Backup read-back failed; cleanup was not started.');
    // Confirm that the saved stream can be decoded with all native BSON types intact.
    let offset = 0;
    let count = 0;
    const hash = createHash('sha256');
    while (offset < persisted.length) {
      const length = persisted.readInt32LE(offset);
      if (length < 5 || offset + length > persisted.length) throw new CleanupError('Backup BSON is incomplete; cleanup was not started.');
      hash.update(BSON.serialize(BSON.deserialize(persisted.subarray(offset, offset + length), BSON_OPTIONS)));
      offset += length;
      count++;
    }
    if (count !== documents.length || hash.digest('hex') !== fingerprint(documents)) {
      throw new CleanupError('Backup BSON verification failed; cleanup was not started.');
    }
    collections.push({ name, filename, count, sha256: sha256(persisted) });
  }
  writePrivate(path.join(directory, 'manifest.ejson'), BSON.EJSON.stringify({
    database, createdAt: new Date(), operation: prefix,
    ...(prefix === 'legacy-cleanup' ? { allowedFields: FIELDS } : prefix === 'category-events-import'
      ? { insertOnlyCollections: ['eventList', 'EventPhotos'] }
      : { updateOnlyCollections: ['eventList'], allowedFields: { eventList: [
        'categories', 'category', 'place', 'address', 'placeId', 'latitude', 'longitude', 'timeZone', 'description',
      ] }, descriptionScope: 'Exact approved notice replacement on explicitly flagged category-demo-2026-11-12 seeds only.' }),
    collectionMetadata, collections,
  }, null, 2, { relaxed: false }));
  return directory;
}

async function main() {
  require('dotenv').config({ path: path.resolve(__dirname, '../.env'), quiet: true });
  const args = process.argv.slice(2);
  if (args.length > 1 || args.some(arg => !['--plan', '--apply'].includes(arg))) {
    throw new CleanupError('Use --plan (read only) or --apply (backup and approved field cleanup).');
  }
  if (!process.env.MONGO_URI) throw new CleanupError('MONGO_URI is not configured.');
  const apply = args[0] === '--apply';
  const client = new MongoClient(process.env.MONGO_URI, {
    serverSelectionTimeoutMS: 12000, connectTimeoutMS: 10000, maxPoolSize: 3,
  });
  const deadline = setTimeout(() => {
    console.error(JSON.stringify({ error: 'ConnectionTimeout', ...operation })); process.exit(1);
  }, 35000);
  try {
    await client.connect(); clearTimeout(deadline);
    operation.stage = 'preflight';
    const db = client.db();
    const beforeMetadata = await metadata(db);
    const names = Object.keys(beforeMetadata);
    const before = await readSnapshot(client, db, names);
    verifyCoverage(before);
    const summary = { mode: apply ? 'apply' : 'plan', cleanup: plan(before) };
    if (!apply) { console.log(JSON.stringify(summary, null, 2)); return; }

    operation.stage = 'backup';
    operation.backupPath = backup(before, beforeMetadata, db.databaseName);
    console.log(JSON.stringify({ stage: 'backup-complete', backupPath: operation.backupPath }));
    if (canonical(await metadata(db)) !== canonical(beforeMetadata)) {
      throw new CleanupError('Collection metadata changed after backup; cleanup was not started.');
    }
    const session = client.startSession();
    let changes;
    try {
      operation.stage = 'transaction';
      operation.commitStatus = 'not-confirmed';
      await session.withTransaction(async () => {
        const current = await snapshot(db, names, session);
        assertSnapshot(current, before, names);
        verifyCoverage(current);
        changes = {};
        // Only these three hard-coded collections can receive writes, and only $unset.
        for (const name of Object.keys(FIELDS)) {
          const fields = FIELDS[name];
          const result = await db.collection(name).updateMany({
            $or: fields.map(field => ({ [field]: { $exists: true } })),
          }, { $unset: Object.fromEntries(fields.map(field => [field, ''])) }, { session });
          const expectedCount = summary.cleanup[name].documentsToClean;
          if (result.matchedCount !== expectedCount || result.modifiedCount !== expectedCount) {
            throw new CleanupError('Cleanup counts changed during the transaction; cleanup was aborted.');
          }
          changes[name] = { matched: result.matchedCount, modified: result.modifiedCount };
        }
        const after = await snapshot(db, names, session);
        assertSnapshot(after, before, names, true);
        verifyCoverage(after);
        // A separate snapshot catches outside writes hidden by this transaction's snapshot.
        assertSnapshot(await readSnapshot(client, db, names), before, names);
        if (canonical(await metadata(db)) !== canonical(beforeMetadata)) {
          throw new CleanupError('Collection metadata changed during cleanup; cleanup was aborted.');
        }
      }, TRANSACTION_OPTIONS);
      operation.commitStatus = 'confirmed';
    } finally { await session.endSession(); }

    operation.stage = 'verification';
    const after = await readSnapshot(client, db, names);
    const afterMetadata = await metadata(db);
    const collectionChecks = Object.fromEntries(names.map(name => [name, {
      beforeCount: before[name].length,
      afterCount: after[name].length,
      onlyApprovedFieldsRemoved: fingerprint(after[name]) === fingerprint(before[name].map(document => stripped(name, document))),
      metadataUnchanged: canonical(beforeMetadata[name]) === canonical(afterMetadata[name]),
    }]));
    const remaining = plan(after);
    const report = {
      ...summary, completedAt: new Date().toISOString(), backupPath: operation.backupPath,
      commitStatus: operation.commitStatus, changes, collectionChecks,
      collectionSetUnchanged: canonical(Object.keys(afterMetadata)) === canonical(names),
      legacyFieldsAbsent: Object.values(remaining).every(item => item.documentsToClean === 0),
      destinationCoverageValid: true,
    };
    verifyCoverage(after);
    report.integrityVerified = report.collectionSetUnchanged && report.legacyFieldsAbsent &&
      Object.values(collectionChecks).every(check => check.onlyApprovedFieldsRemoved && check.metadataUnchanged);
    writePrivate(path.join(operation.backupPath, 'cleanup-report.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
    if (!report.integrityVerified) {
      throw new CleanupError('Cleanup committed, but concurrent changes or a verification difference require review before further cleanup.');
    }
    operation.stage = 'complete';
  } finally { clearTimeout(deadline); await client.close(); }
}

module.exports = {
  backup, snapshot, readSnapshot, metadata, canonical, fingerprint, assertSnapshot,
  BSON_OPTIONS, TRANSACTION_OPTIONS, writePrivate,
};

if (require.main === module) main().catch(error => {
  console.error(JSON.stringify({
    error: error.name, code: error.code ?? null, ...operation,
    message: error instanceof CleanupError ? error.message : 'Cleanup stopped; connection details and document values are omitted.',
  }));
  process.exitCode = 1;
});
