// Additive administrative copy only. Never imports the app or changes original collections.
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { createHash, randomUUID } = require('node:crypto');
const { MongoClient, BSON, ObjectId } = require('mongodb');
require('dotenv').config({ path: path.resolve(__dirname, '../.env'), quiet: true });

// These staged models have autoCreate/autoIndex disabled. Mongoose is never connected.
const models = {
  UserProfiles: require('../src/models/UserProfile'),
  AccountSecurity: require('../src/models/AccountSecurity'),
  UserAvatars: require('../src/models/UserAvatar'),
  EventPhotos: require('../src/models/EventPhoto'),
  StorePhotos: require('../src/models/StorePhoto'),
};
const TARGET_NAMES = Object.freeze(['UserProfiles', 'AccountSecurity', 'UserAvatars', 'EventPhotos', 'StorePhotos']);
const SOURCE_NAMES = ['AccountList', 'eventList', 'StoreList'];
const INDEXES = {
  UserProfiles: { userId: 1 }, AccountSecurity: { userId: 1 }, UserAvatars: { userId: 1 },
  EventPhotos: { eventId: 1, displayOrder: 1 }, StorePhotos: { storeId: 1, displayOrder: 1 },
};
const SECURITY_DEFAULTS = {
  authVersion: 0, mfaEnabled: false, mfaRecoveryCodeHashes: [], mfaLastUsedStep: -1,
  mfaFailedAttempts: 0, mfaLockedUntil: null,
  securityPasswordFailedAttempts: 0, securityPasswordLockedUntil: null,
  loginPasswordFailedAttempts: 0, loginPasswordLockedUntil: null,
};
const has = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const bsonOptions = { promoteValues: false, promoteBuffers: false };

class CopyError extends Error {
  constructor(message) { super(message); this.name = 'SplitCollectionCopyError'; }
}

function sortedJson(value) {
  if (Array.isArray(value)) return value.map(sortedJson);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, sortedJson(value[key])]));
  return value;
}
const canonical = value => JSON.stringify(sortedJson(BSON.EJSON.serialize(value, { relaxed: false })));
const clone = value => BSON.deserialize(BSON.serialize(value), bsonOptions);

function bytes(value) {
  if (Buffer.isBuffer(value)) return value;
  if (value instanceof Uint8Array) return Buffer.from(value);
  if (value?._bsontype === 'Binary') return Buffer.from(value.value(true));
  return null;
}

function timestamps(source) {
  if (!(source.createdAt instanceof Date) || !(source.updatedAt instanceof Date) ||
      !Number.isFinite(source.createdAt.getTime()) || !Number.isFinite(source.updatedAt.getTime())) {
    throw new CopyError('A source record has missing timestamps; no replacement dates will be invented.');
  }
  return { createdAt: source.createdAt, updatedAt: source.updatedAt };
}

// Validate native BSON types too: Mongoose casting must not conceal an incompatible source type.
function validateNativeTypes(name, document) {
  for (const field of ['_id', 'userId', 'eventId', 'storeId']) {
    if (has(document, field) && !(document[field] instanceof ObjectId)) {
      throw new CopyError('Prepared ' + name + ' has an invalid ObjectId field: ' + field + '.');
    }
  }
  for (const field of ['phone', 'bio', 'dob', 'passwordHash', 'mfaSecretEncrypted', 'avatarMimeType', 'imageMimeType']) {
    if (has(document, field) && document[field] !== null && typeof document[field] !== 'string') {
      throw new CopyError('Prepared ' + name + ' has an invalid string field: ' + field + '.');
    }
  }
  if (has(document, 'mfaEnabled') && document.mfaEnabled !== null && typeof document.mfaEnabled !== 'boolean') {
    throw new CopyError('Prepared AccountSecurity has an invalid MFA enabled flag.');
  }
  if (has(document, 'mfaRecoveryCodeHashes') && document.mfaRecoveryCodeHashes !== null &&
      (!Array.isArray(document.mfaRecoveryCodeHashes) || document.mfaRecoveryCodeHashes.some(value => typeof value !== 'string'))) {
    throw new CopyError('Prepared AccountSecurity has invalid recovery-code hash types.');
  }
  for (const field of ['authVersion', 'mfaLastUsedStep', 'mfaFailedAttempts', 'securityPasswordFailedAttempts', 'loginPasswordFailedAttempts', 'displayOrder', '__v']) {
    if (!has(document, field) || document[field] === null) continue;
    const value = document[field];
    const numeric = typeof value === 'number' || ['Int32', 'Double', 'Long'].includes(value?._bsontype);
    if (!numeric || !Number.isSafeInteger(Number(value.toString()))) {
      throw new CopyError('Prepared ' + name + ' has an invalid integer field: ' + field + '.');
    }
  }
  for (const field of ['mfaLockedUntil', 'securityPasswordLockedUntil', 'loginPasswordLockedUntil']) {
    if (has(document, field) && document[field] !== null && !(document[field] instanceof Date)) {
      throw new CopyError('Prepared AccountSecurity has an invalid lockout date field: ' + field + '.');
    }
  }
}

function fingerprint(documents) {
  const hash = createHash('sha256');
  for (const document of documents) hash.update(BSON.serialize(document));
  return hash.digest('hex');
}

function collection(db, name) {
  if (!TARGET_NAMES.includes(name)) throw new CopyError('Refused a write outside the five destination collections.');
  return db.collection(name);
}

async function readDocuments(db, name, session) {
  return db.collection(name).find({}, { ...bsonOptions, ...(session ? { session } : {}) }).sort({ _id: 1 }).toArray();
}

async function readSnapshot(client, db, names) {
  const session = client.startSession();
  try {
    let snapshot;
    await session.withTransaction(async () => {
      snapshot = {};
      for (const name of names) snapshot[name] = await readDocuments(db, name, session);
    }, { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' }, readPreference: 'primary' });
    return snapshot;
  } finally { await session.endSession(); }
}

async function metadata(db, names) {
  const listed = await db.listCollections({}, { nameOnly: false }).toArray();
  const byName = new Map(listed.map(item => [item.name, item]));
  const result = {};
  for (const name of names) {
    const info = byName.get(name);
    if (!info || info.type !== 'collection') throw new CopyError('An original collection is missing or is not a collection.');
    const indexes = await db.collection(name).indexes();
    indexes.sort((a, b) => a.name.localeCompare(b.name));
    result[name] = { options: info.options, uuid: info.info?.uuid, indexes };
  }
  return result;
}

function photoDocuments(resource, parentField, namespace) {
  if (resource.imageData != null && !bytes(resource.imageData)) throw new CopyError('A legacy photo has an invalid binary field.');
  const images = Array.isArray(resource.photos) ? resource.photos
    : bytes(resource.imageData)?.length ? [{ imageData: resource.imageData, imageMimeType: resource.imageMimeType }] : [];
  if (images.length > 5) throw new CopyError('A source item exceeds the five-photo limit.');
  if (resource.photos != null && !Array.isArray(resource.photos)) throw new CopyError('A source photo collection is not an array.');
  return images.map((photo, displayOrder) => {
    const data = bytes(photo.imageData);
    if (!data?.length || data.length > 1024 * 1024 || photo.imageMimeType !== 'image/jpeg') {
      throw new CopyError('A source photo is missing valid JPEG metadata or exceeds 1 MiB.');
    }
    const id = photo._id ?? new ObjectId(digest(Buffer.from(namespace + ':' + String(resource._id) + ':' + displayOrder)).slice(0, 24));
    return {
      _id: id, [parentField]: resource._id, imageData: photo.imageData,
      imageMimeType: photo.imageMimeType, displayOrder,
      ...timestamps({ createdAt: photo.createdAt ?? resource.createdAt, updatedAt: photo.updatedAt ?? resource.updatedAt }), __v: 0,
    };
  });
}

async function prepare(snapshot) {
  const plan = Object.fromEntries(TARGET_NAMES.map(name => [name, []]));
  for (const account of snapshot.AccountList) {
    if (account.avatarData != null && !bytes(account.avatarData)) throw new CopyError('An existing avatar has an invalid binary field.');
    const base = { _id: account._id, userId: account._id, ...timestamps(account), __v: 0 };
    const profile = { ...base };
    for (const field of ['phone', 'bio', 'dob']) profile[field] = has(account, field) ? account[field] : '';
    plan.UserProfiles.push(profile);
    const security = { ...base, passwordHash: account.passwordHash };
    for (const [field, fallback] of Object.entries(SECURITY_DEFAULTS)) security[field] = has(account, field) ? account[field] : fallback;
    if (has(account, 'mfaSecretEncrypted')) security.mfaSecretEncrypted = account.mfaSecretEncrypted;
    plan.AccountSecurity.push(security);
    if (bytes(account.avatarData)?.length) {
      if (typeof account.avatarMimeType !== 'string' || !account.avatarMimeType) throw new CopyError('An existing avatar has no MIME type.');
      plan.UserAvatars.push({ ...base, avatarData: account.avatarData, avatarMimeType: account.avatarMimeType });
    }
  }
  for (const event of snapshot.eventList) plan.EventPhotos.push(...photoDocuments(event, 'eventId', 'event-photo'));
  for (const store of snapshot.StoreList) plan.StorePhotos.push(...photoDocuments(store, 'storeId', 'store-photo'));

  for (const name of TARGET_NAMES) {
    const ids = new Set();
    const keys = new Set();
    for (let i = 0; i < plan[name].length; ++i) {
      const document = plan[name][i];
      validateNativeTypes(name, document);
      const id = String(document._id);
      const key = Object.keys(INDEXES[name]).map(field => String(document[field])).join(':');
      if (ids.has(id) || keys.has(key)) throw new CopyError('Prepared destination IDs or unique relationships collide.');
      ids.add(id); keys.add(key);
      const validation = clone(document);
      if (validation.imageData) validation.imageData = bytes(validation.imageData);
      if (validation.avatarData) validation.avatarData = bytes(validation.avatarData);
      try { await new models[name](validation).validate(); }
      catch (error) {
        const fields = Object.keys(error.errors ?? {}).sort().join(', ') || 'schema';
        throw new CopyError('Prepared ' + name + ' data failed validation for: ' + fields + '.');
      }
      plan[name][i] = clone(document);
    }
    plan[name].sort((a, b) => String(a._id).localeCompare(String(b._id)));
  }
  return plan;
}

async function compareTargets(db, plan, existingNames, session) {
  const missing = {};
  const matched = {};
  for (const name of TARGET_NAMES) {
    const actual = existingNames.has(name) ? await readDocuments(db, name, session) : [];
    const expected = new Map(plan[name].map(document => [String(document._id), document]));
    const present = new Set();
    for (const document of actual) {
      const id = String(document._id);
      if (!expected.has(id) || canonical(document) !== canonical(expected.get(id))) {
        throw new CopyError('Existing ' + name + ' data conflicts with this copy; nothing will be overwritten.');
      }
      present.add(id);
    }
    missing[name] = plan[name].filter(document => !present.has(String(document._id)));
    matched[name] = present.size;
  }
  return { missing, matched };
}

function protectWindowsBackup(root, directory) {
  if (process.platform !== 'win32') return;
  // Explicit NTFS ACLs are needed on Windows; POSIX file modes alone do not restrict access.
  const script = [
    "$ErrorActionPreference = 'Stop'",
    "$root = [System.IO.Path]::GetFullPath($env:SPLIT_COPY_BACKUP_ROOT)",
    "$folder = [System.IO.Path]::GetFullPath($env:SPLIT_COPY_BACKUP_PATH)",
    "if (-not $folder.StartsWith($root + [System.IO.Path]::DirectorySeparatorChar, [System.StringComparison]::OrdinalIgnoreCase)) { throw 'Invalid backup directory' }",
    "$owner = [System.Security.Principal.WindowsIdentity]::GetCurrent().User",
    "foreach ($target in @($root, $folder)) {",
    "  $acl = New-Object System.Security.AccessControl.DirectorySecurity",
    "  $acl.SetOwner($owner)",
    "  $acl.SetAccessRuleProtection($true, $false)",
    "  foreach ($sid in @($owner, [System.Security.Principal.SecurityIdentifier]::new('S-1-5-18'), [System.Security.Principal.SecurityIdentifier]::new('S-1-5-32-544'))) {",
    "    $rule = [System.Security.AccessControl.FileSystemAccessRule]::new($sid, 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow')",
    "    $acl.AddAccessRule($rule)",
    "  }",
    "  Set-Acl -LiteralPath $target -AclObject $acl",
    "}",
  ].join('\n');
  try {
    execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
      env: { ...process.env, SPLIT_COPY_BACKUP_ROOT: root, SPLIT_COPY_BACKUP_PATH: directory },
      stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
    });
  } catch { throw new CopyError('Could not restrict the private backup directory; no data was exported or copied.'); }
}

function backup(originals, originalMetadata, destinations, database) {
  const root = path.resolve(__dirname, '../.local-backups');
  const ignoreFile = fs.readFileSync(path.resolve(__dirname, '../../.gitignore'), 'utf8');
  if (!ignoreFile.split(/\r?\n/).includes('backend/.local-backups/')) throw new CopyError('Private backup folder must be excluded from Git before copying.');
  const directory = path.join(root, 'split-copy-' + new Date().toISOString().replace(/[:.]/g, '-') + '-' + randomUUID());
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  protectWindowsBackup(root, directory);
  const entries = [];
  for (const [name, documents] of Object.entries({ ...originals, ...destinations })) {
    const filename = String(entries.length).padStart(3, '0') + '.bson';
    const contents = Buffer.concat(documents.map(document => BSON.serialize(document)));
    fs.writeFileSync(path.join(directory, filename), contents, { flag: 'wx', mode: 0o600 });
    const persisted = fs.readFileSync(path.join(directory, filename));
    if (!contents.equals(persisted)) throw new CopyError('Backup read-back did not match; destination writes were not started.');
    entries.push({ name, filename, count: documents.length, sha256: digest(persisted) });
  }
  fs.writeFileSync(path.join(directory, 'manifest.ejson'), BSON.EJSON.stringify({
    database, createdAt: new Date(), originals: Object.keys(originals), originalMetadata, collections: entries,
  }, null, 2, { relaxed: false }), { flag: 'wx', mode: 0o600 });
  return directory;
}

async function main() {
  const args = process.argv.slice(2);
  if (args.some(arg => !['--plan', '--apply'].includes(arg)) || args.length > 1) throw new CopyError('Use --plan or --apply.');
  const apply = args[0] === '--apply';
  if (!process.env.MONGO_URI) throw new CopyError('MONGO_URI is not configured.');
  const client = new MongoClient(process.env.MONGO_URI, { serverSelectionTimeoutMS: 12000, connectTimeoutMS: 10000, maxPoolSize: 3 });
  const deadline = setTimeout(() => { console.error(JSON.stringify({ error: 'ConnectionTimeout', writesStarted: false })); process.exit(1); }, 35000);
  let backupPath;
  try {
    await client.connect();
    clearTimeout(deadline);
    const db = client.db();
    const listed = await db.listCollections({}, { nameOnly: false }).toArray();
    const originalNames = listed.map(item => item.name).filter(name => !TARGET_NAMES.includes(name)).sort();
    if (SOURCE_NAMES.some(name => !originalNames.includes(name))) throw new CopyError('An expected source collection is missing.');
    const originalMetadata = await metadata(db, originalNames);
    const originals = await readSnapshot(client, db, originalNames);
    const plan = await prepare(originals);
    const existingNames = new Set(listed.map(item => item.name));
    const comparison = await compareTargets(db, plan, existingNames);
    const summary = {
      mode: apply ? 'apply' : 'plan', database: db.databaseName,
      originalCounts: Object.fromEntries(originalNames.map(name => [name, originals[name].length])),
      destinations: Object.fromEntries(TARGET_NAMES.map(name => [name, {
        expected: plan[name].length, alreadyMatching: comparison.matched[name], toInsert: comparison.missing[name].length,
      }])),
    };
    if (!apply) { console.log(JSON.stringify(summary, null, 2)); return; }

    const destinationBefore = {};
    for (const name of TARGET_NAMES) destinationBefore[name] = existingNames.has(name) ? await readDocuments(db, name) : [];
    backupPath = backup(originals, originalMetadata, destinationBefore, db.databaseName);
    console.log(JSON.stringify({ stage: 'backup-complete', backupPath }));
    for (const name of TARGET_NAMES) {
      if (!existingNames.has(name)) await db.createCollection(name);
      await collection(db, name).createIndex(INDEXES[name], { unique: true });
    }
    const session = client.startSession();
    let inserted;
    try {
      await session.withTransaction(async () => {
        for (const name of SOURCE_NAMES) {
          if (fingerprint(await readDocuments(db, name, session)) !== fingerprint(originals[name])) {
            throw new CopyError('Source data changed after backup; rerun with a fresh snapshot.');
          }
        }
        const current = await compareTargets(db, plan, new Set(TARGET_NAMES), session);
        inserted = {};
        for (const name of TARGET_NAMES) {
          const documents = current.missing[name];
          if (documents.length) await collection(db, name).insertMany(documents, { session, ordered: true });
          inserted[name] = documents.length;
        }
        // A separate fresh read detects source writes hidden by this transaction's snapshot.
        for (const name of SOURCE_NAMES) {
          if (fingerprint(await readDocuments(db, name)) !== fingerprint(originals[name])) {
            throw new CopyError('Source data changed during copying; destination inserts were aborted.');
          }
        }
      }, { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' }, readPreference: 'primary' });
    } finally { await session.endSession(); }
    const verified = await compareTargets(db, plan, new Set(TARGET_NAMES));
    if (TARGET_NAMES.some(name => verified.missing[name].length)) throw new CopyError('Destination verification found missing copies.');
    const after = await readSnapshot(client, db, originalNames);
    const metadataAfter = await metadata(db, originalNames);
    const originalChecks = Object.fromEntries(originalNames.map(name => [name, {
      beforeCount: originals[name].length, afterCount: after[name].length,
      documentsUnchanged: fingerprint(originals[name]) === fingerprint(after[name]),
      metadataUnchanged: canonical(originalMetadata[name]) === canonical(metadataAfter[name]),
    }]));
    const originalsUnchanged = Object.values(originalChecks).every(check => check.documentsUnchanged && check.metadataUnchanged);
    const report = { ...summary, completedAt: new Date().toISOString(), backupPath, inserted, copiesCommitted: true, originalsUnchanged,
      verifiedCounts: Object.fromEntries(TARGET_NAMES.map(name => [name, verified.matched[name]])), originalChecks };
    fs.writeFileSync(path.join(backupPath, 'copy-report.json'), JSON.stringify(report, null, 2), { flag: 'wx', mode: 0o600 });
    console.log(JSON.stringify(report, null, 2));
    if (!originalsUnchanged) {
      throw new CopyError('Copies are committed, but originals changed outside this script during the snapshot interval; inspect the private report before further work.');
    }
  } catch (error) {
    if (backupPath) console.error(JSON.stringify({ backupPath }));
    throw error;
  } finally { clearTimeout(deadline); await client.close(); }
}

main().catch(error => {
  console.error(JSON.stringify({ error: error.name, code: error.code ?? null,
    message: error instanceof CopyError ? error.message : 'Copy operation failed; connection details and document values are omitted.' }));
  process.exitCode = 1;
});
