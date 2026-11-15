const path = require('node:path');
const { randomBytes } = require('node:crypto');
const argon2 = require('argon2');
const mongoose = require('mongoose');

// Importing models, connecting, and previewing must not provision collections/indexes.
mongoose.set('autoCreate', false);
mongoose.set('autoIndex', false);
const User = require('../src/models/User');
const UserProfile = require('../src/models/UserProfile');
const AccountSecurity = require('../src/models/AccountSecurity');
const Friendship = require('../src/models/Friendship');
const { withActiveAccountWrite } = require('../src/services/activeAccountWrite');

const TOOL = 'nearme-friend-fixtures-v1';
const MANIFESTS = 'friendFixtureManifests';
// Legacy addresses identify only these exact, preexisting demo identities. Newly
// created fixtures use the reserved .invalid domain and receive no usable password.
const DEMOS = [
  { firstName: 'Alice', lastName: 'Test', username: 'alicetest', email: 'alice@fixtures.nearme.invalid', legacyEmail: 'alice@test.com', status: 'accepted', incoming: false },
  { firstName: 'Bob', lastName: 'Demo', username: 'bobdemo', email: 'bob@fixtures.nearme.invalid', legacyEmail: 'bob@test.com', status: 'pending', incoming: true },
  { firstName: 'Charlie', lastName: 'Mock', username: 'charliemock', email: 'charlie@fixtures.nearme.invalid', legacyEmail: 'charlie@test.com', status: 'pending', incoming: false },
];

class FixtureError extends Error {}
const id = value => String(value);
const validId = value => /^[a-f0-9]{24}$/i.test(id(value));
const manifestKey = ownerId => `${TOOL}:${ownerId}`;
const pair = (left, right) => ({ $or: [{ requester: left, recipient: right }, { requester: right, recipient: left }] });
const demoMatches = (account, demo) => Boolean(account && account.username === demo.username &&
  account.firstName === demo.firstName && account.lastName === demo.lastName &&
  [demo.email, demo.legacyEmail].includes(account.email));

function help(mode) {
  const script = mode === 'seed' ? 'seedFakeFriends.js' : 'removeFakeFriends.js';
  console.log(`Usage: node backend/scripts/${script} (--username NAME | --user-id ID) [--apply]
Default: connect for a read-only preview. --apply explicitly commits the displayed operation.
Select one existing active real owner by exact username or account ID. No default owner is selected.
Seed: create missing demo identities with UserProfiles and AccountSecurity, then add only absent relationships.
Existing credentials and every existing relationship, including blocked/rejected requests, are preserved.
Cleanup: delete only unchanged relationships created by this utility and recorded in its owner-specific manifest.
Changed/adopted relationships and ALL accounts, profile/security records, events, and event hosts are retained.
Old fixture records without a manifest are never adopted for cleanup. No records are deleted by email/domain.
The seed manifest (${MANIFESTS}) commits atomically with new fixture records. No passwords are printed or saved in it.
Examples:
  node backend/scripts/${script} --username YourUsername
  node backend/scripts/${script} --user-id 0123456789abcdef01234567 --apply`);
}

function parseArgs(args) {
  const result = { apply: false, help: false };
  for (let index = 0; index < args.length; index++) {
    const flag = args[index];
    if (flag === '--help') { result.help = true; continue; }
    if (flag === '--apply' && !result.apply) { result.apply = true; continue; }
    if ((flag === '--username' || flag === '--user-id') && !result.selector) {
      const value = args[++index];
      if (!value || value.startsWith('--')) throw new FixtureError(`${flag} requires a value.`);
      if (flag === '--username' && !/^[A-Za-z0-9]{1,25}$/.test(value)) throw new FixtureError('Use an exact valid username.');
      if (flag === '--user-id' && !/^[a-f0-9]{24}$/i.test(value)) throw new FixtureError('Use a 24-character account ID.');
      result.selector = flag === '--username' ? { username: value } : { _id: value };
      continue;
    }
    throw new FixtureError(`Unknown or repeated option: ${flag}`);
  }
  if (!result.help && !result.selector) throw new FixtureError('Choose exactly one --username or --user-id. Use --help for details.');
  return result;
}

async function ownerContext(selector) {
  const owner = await User.findOne(selector).select('_id firstName lastName username email deletedAt').lean();
  if (!owner || owner.deletedAt != null) throw new FixtureError('The selected owner is unavailable or closed.');
  if (DEMOS.some(demo => demoMatches(owner, demo))) throw new FixtureError('Choose a real owner rather than a fixture account.');
  const security = await AccountSecurity.findOne({ userId: owner._id }).select('_id +authVersion').lean();
  if (!security || !(await UserProfile.exists({ userId: owner._id }))) {
    throw new FixtureError('The selected owner needs complete profile/security records before using this utility.');
  }
  return { owner, auth: { userId: owner._id, authVersion: security.authVersion ?? 0 } };
}

async function findDemo(demo, session) {
  const matches = await User.find({ $or: [
    { username: demo.username }, { email: { $in: [demo.email, demo.legacyEmail] } },
  ] }).select('_id firstName lastName username email deletedAt').session(session ?? null).lean();
  if (matches.length > 1 || (matches.length === 1 && !demoMatches(matches[0], demo))) {
    throw new FixtureError(`@${demo.username} has an identity collision. No account was changed.`);
  }
  const account = matches[0];
  if (account?.deletedAt != null) throw new FixtureError(`@${demo.username} is closed and will not be reused.`);
  if (account) {
    const profile = await UserProfile.exists({ userId: account._id }).session(session ?? null);
    const security = await AccountSecurity.exists({ userId: account._id }).session(session ?? null);
    if (!profile || !security) {
      throw new FixtureError(`@${demo.username} needs a separate reviewed split-record repair. This utility never replaces existing credentials.`);
    }
  }
  return account;
}

function validateManifest(manifest, ownerId) {
  if (!manifest) return;
  if (manifest._id !== manifestKey(ownerId) || manifest.tool !== TOOL || manifest.schemaVersion !== 1 ||
      id(manifest.ownerId) !== id(ownerId) || !Array.isArray(manifest.fixtures) || !Array.isArray(manifest.relationships)) {
    throw new FixtureError('The fixture manifest is incompatible. No cleanup or import was performed.');
  }
  const fixtureIds = new Set();
  for (const fixture of manifest.fixtures) {
    if (!validId(fixture.userId) || !DEMOS.some(demo => demo.username === fixture.username) ||
        typeof fixture.createdByUtility !== 'boolean' || id(fixture.userId) === id(ownerId)) {
      throw new FixtureError('The fixture manifest contains an invalid account reference.');
    }
    fixtureIds.add(id(fixture.userId));
  }
  const seen = new Set();
  for (const relationship of manifest.relationships) {
    const counterpart = id(relationship.requester) === id(ownerId) ? relationship.recipient : relationship.requester;
    if (!validId(relationship._id) || !validId(relationship.requester) || !validId(relationship.recipient) ||
        (id(relationship.requester) !== id(ownerId) && id(relationship.recipient) !== id(ownerId)) ||
        !fixtureIds.has(id(counterpart)) || !['accepted', 'pending'].includes(relationship.status) ||
        !(relationship.createdAt instanceof Date) || !(relationship.updatedAt instanceof Date) || seen.has(id(relationship._id))) {
      throw new FixtureError('The fixture manifest contains an invalid relationship reference.');
    }
    seen.add(id(relationship._id));
  }
}

async function readManifest(ownerId, session) {
  const manifest = await mongoose.connection.db.collection(MANIFESTS).findOne({ _id: manifestKey(ownerId) }, { session });
  validateManifest(manifest, ownerId);
  return manifest;
}

async function seedPlan(owner) {
  const fixtures = [];
  for (const demo of DEMOS) {
    const account = await findDemo(demo);
    const relationships = account ? await Friendship.find(pair(owner._id, account._id)).select('status').lean() : [];
    fixtures.push({ demo, account, relationships });
  }
  await readManifest(owner._id);
  return fixtures;
}

async function requireIndexes() {
  const db = mongoose.connection.db;
  const requirements = [
    [User.collection.name, ['username']], [User.collection.name, ['email']],
    [UserProfile.collection.name, ['userId']], [AccountSecurity.collection.name, ['userId']],
    [Friendship.collection.name, ['requester', 'recipient']],
  ];
  for (const [name, fields] of requirements) {
    const indexes = await db.collection(name).listIndexes().toArray();
    if (!indexes.some(index => index.unique && !index.partialFilterExpression && !index.sparse &&
        Object.keys(index.key).length === fields.length && fields.every(field => index.key[field] === 1))) {
      throw new FixtureError(`Provision the required unique index on ${name} (${fields.join(', ')}) before applying fixtures.`);
    }
  }
  const exists = await db.listCollections({ name: MANIFESTS }, { nameOnly: true }).hasNext();
  if (!exists) {
    try { await db.createCollection(MANIFESTS); }
    catch (error) { if (error.code !== 48) throw error; }
  }
}

async function applySeed(context, plan) {
  await requireIndexes();
  const prepared = new Map();
  for (const fixture of plan) {
    if (!fixture.account) prepared.set(fixture.demo.username, {
      _id: new mongoose.Types.ObjectId(),
      // The random value is hashed directly, discarded, and never logged or placed in a manifest.
      passwordHash: await argon2.hash(randomBytes(48).toString('base64url'), { type: argon2.argon2id }),
    });
  }
  return withActiveAccountWrite(context.auth, plan.filter(fixture => fixture.account).map(fixture => fixture.account._id), async session => {
    const now = new Date();
    const manifest = await readManifest(context.owner._id, session) || {
      _id: manifestKey(context.owner._id), tool: TOOL, schemaVersion: 1, ownerId: context.owner._id,
      fixtures: [], relationships: [], createdAt: now,
    };
    const results = [];
    for (const fixture of plan) {
      const { demo } = fixture;
      let account = await findDemo(demo, session);
      if (id(account?._id) !== id(fixture.account?._id)) throw new FixtureError('Fixture identities changed after the preview. Run a fresh preview.');
      const created = !account;
      if (!account) {
        const fields = prepared.get(demo.username);
        const [identity] = await User.create([{ _id: fields._id, firstName: demo.firstName, lastName: demo.lastName,
          username: demo.username, email: demo.email }], { session });
        await UserProfile.create([{ _id: identity._id, userId: identity._id }], { session });
        await AccountSecurity.create([{ _id: identity._id, userId: identity._id, passwordHash: fields.passwordHash }], { session });
        account = identity;
      }
      const known = manifest.fixtures.find(record => id(record.userId) === id(account._id));
      if (!known) manifest.fixtures.push({ userId: account._id, username: demo.username, createdByUtility: created });
      const existing = await Friendship.find(pair(context.owner._id, account._id)).session(session).select('status').lean();
      if (existing.length) {
        results.push({ username: demo.username, account: created ? 'created' : 'reused', relationship: 'preserved', statuses: existing.map(row => row.status) });
        continue;
      }
      const [relationship] = await Friendship.create([{
        requester: demo.incoming ? account._id : context.owner._id,
        recipient: demo.incoming ? context.owner._id : account._id, status: demo.status,
      }], { session });
      manifest.relationships.push({ _id: relationship._id, requester: relationship.requester, recipient: relationship.recipient,
        status: relationship.status, createdAt: relationship.createdAt, updatedAt: relationship.updatedAt });
      results.push({ username: demo.username, account: created ? 'created' : 'reused', relationship: 'created', status: demo.status });
    }
    manifest.updatedAt = now;
    await mongoose.connection.db.collection(MANIFESTS).replaceOne({ _id: manifest._id }, manifest, { upsert: true, session });
    return results;
  });
}

const unchanged = (current, record) => Boolean(current && id(current.requester) === id(record.requester) &&
  id(current.recipient) === id(record.recipient) && current.status === record.status &&
  current.createdAt?.getTime() === record.createdAt.getTime() && current.updatedAt?.getTime() === record.updatedAt.getTime());

async function cleanupRow(ownerId, manifest, record, session) {
  const current = await Friendship.findById(record._id).session(session ?? null).lean();
  if (!current) return { record, action: 'already absent' };
  if (record.cleanedAt || !unchanged(current, record)) return { record, action: 'preserve changed relationship' };
  const counterpartId = id(record.requester) === id(ownerId) ? record.recipient : record.requester;
  const fixture = manifest.fixtures.find(candidate => id(candidate.userId) === id(counterpartId));
  const demo = DEMOS.find(candidate => candidate.username === fixture.username);
  const account = await User.findById(counterpartId).select('_id firstName lastName username email deletedAt').session(session ?? null).lean();
  if (!demoMatches(account, demo) || account.deletedAt != null) return { record, action: 'preserve unavailable or changed account' };
  return { record, counterpartId, action: 'delete unchanged seeded relationship' };
}

async function cleanupPlan(ownerId, manifest, session) {
  const rows = [];
  for (const record of manifest?.relationships || []) rows.push(await cleanupRow(ownerId, manifest, record, session));
  return rows;
}

async function applyCleanup(context, plan) {
  const candidates = plan.filter(row => row.action === 'delete unchanged seeded relationship');
  if (!candidates.length) return [];
  return withActiveAccountWrite(context.auth, candidates.map(row => row.counterpartId), async session => {
    const manifest = await readManifest(context.owner._id, session);
    if (!manifest) throw new FixtureError('The fixture manifest disappeared. No relationships were removed.');
    const results = [];
    for (const candidate of candidates) {
      const record = manifest.relationships.find(row => id(row._id) === id(candidate.record._id));
      if (!record) throw new FixtureError('The fixture manifest changed. Run a fresh preview.');
      const row = await cleanupRow(context.owner._id, manifest, record, session);
      if (row.action !== 'delete unchanged seeded relationship') { results.push({ id: id(record._id), action: row.action }); continue; }
      const result = await Friendship.deleteOne({ _id: record._id, requester: record.requester, recipient: record.recipient,
        status: record.status, createdAt: record.createdAt, updatedAt: record.updatedAt }, { session });
      if (result.deletedCount !== 1) throw new FixtureError('A seeded relationship changed. No cleanup was committed; preview again.');
      record.cleanedAt = new Date();
      results.push({ id: id(record._id), action: 'removed unchanged seeded relationship' });
    }
    manifest.updatedAt = new Date();
    await mongoose.connection.db.collection(MANIFESTS).replaceOne({ _id: manifest._id }, manifest, { session });
    return results;
  });
}

async function run(mode, args = process.argv.slice(2)) {
  try {
    const options = parseArgs(args);
    if (options.help) { help(mode); return; }
    require('dotenv').config({ path: path.resolve(__dirname, '../.env'), quiet: true });
    if (!process.env.MONGO_URI) throw new FixtureError('MONGO_URI is not configured.');
    await mongoose.connect(process.env.MONGO_URI, { autoCreate: false, autoIndex: false,
      serverSelectionTimeoutMS: 10000, connectTimeoutMS: 8000, socketTimeoutMS: 10000 });
    const context = await ownerContext(options.selector);
    const manifest = await readManifest(context.owner._id);
    const plan = mode === 'seed' ? await seedPlan(context.owner) : await cleanupPlan(context.owner._id, manifest);
    const preview = mode === 'seed' ? plan.map(fixture => ({ username: fixture.demo.username,
      account: fixture.account ? 'reuse exact known demo' : 'create demo with profile/security',
      relationship: fixture.relationships.length ? 'preserve existing' : `create ${fixture.demo.status}`,
      statuses: fixture.relationships.map(row => row.status) })) : plan.map(row => ({ id: id(row.record._id), action: row.action }));
    console.log(JSON.stringify({ mode: options.apply ? `${mode}: apply` : `${mode}: read-only preview`,
      owner: { id: id(context.owner._id), username: context.owner.username }, plan: preview,
      retained: 'All existing credentials, accounts, profiles, security records, events, and event hosts.' }, null, 2));
    if (!options.apply) { console.log('No database writes performed. Add --apply to commit this operation.'); return; }
    const results = mode === 'seed' ? await applySeed(context, plan) : await applyCleanup(context, plan);
    console.log(JSON.stringify({ committed: true, results, accountsDeleted: 0, eventHostsChanged: 0 }, null, 2));
  } catch (error) {
    // Database errors can contain account contacts or connection details; do not print them.
    console.error(error instanceof FixtureError ? error.message : `Fixture operation failed (${error.name}). No credentials were printed.`);
    process.exitCode = 1;
  } finally {
    try { await mongoose.disconnect(); }
    catch { console.error('Database disconnect failed.'); process.exitCode = 1; }
  }
}

module.exports = { run };
