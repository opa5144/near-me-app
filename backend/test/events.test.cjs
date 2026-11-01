// Offline checks only. All MongoDB operations below use in-memory substitutes.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { createRequire } = require('node:module');

const projectRoot = path.resolve(__dirname, '../..');
const templateRoot = projectRoot;
const backendRequire = createRequire(path.join(projectRoot, 'backend/package.json'));
const mongoose = backendRequire('mongoose');
const argon2 = backendRequire('argon2');
let checks = 0;
function checked() { checks++; }

// Load real modules with selected dependencies replaced, keeping database and dotenv access offline.
function load(relative, overrides = {}, transform) {
  const cache = new Map();
  function compile(file) {
    if (cache.has(file)) return cache.get(file).exports;
    const module = { exports: {} };
    cache.set(file, module);
    let source = fs.readFileSync(file, 'utf8');
    if (transform) source = transform(source, file);
    new vm.Script(source, { filename: file });
    const requireLocal = id => {
      if (Object.prototype.hasOwnProperty.call(overrides, id)) return overrides[id];
      if (id.startsWith('.')) {
        let target = path.resolve(path.dirname(file), id);
        if (!path.extname(target)) target += '.js';
        if (fs.existsSync(target)) return compile(target);
        const actual = path.resolve(projectRoot, path.relative(templateRoot, target));
        return require(actual);
      }
      return backendRequire(id);
    };
    const wrapper = new vm.Script('(function(require,module,exports,__dirname,__filename){\n' + source + '\n})', { filename: file });
    wrapper.runInThisContext()(requireLocal, module, module.exports, path.dirname(file), file);
    return module.exports;
  }
  return compile(path.join(templateRoot, relative));
}

// Capture route registrations without starting an Express server.
function fakeRouter() {
  const routes = [];
  return {
    routes,
    get(route, ...handlers) { routes.push({ method: 'GET', route, handlers }); },
    post(route, ...handlers) { routes.push({ method: 'POST', route, handlers }); },
  };
}
// Run the registered middleware chain with small request/response substitutes.
async function invoke(router, method, route, options = {}) {
  const entry = router.routes.find(item => item.method === method && item.route === route);
  assert.ok(entry, 'Expected route ' + method + ' ' + route);
  const result = { status: 200, headers: {} };
  const req = {
    body: options.body, params: options.params || {}, protocol: 'http',
    get(name) {
      if (name.toLowerCase() === 'authorization') return options.token ? 'Bearer ' + options.token : undefined;
      if (name.toLowerCase() === 'host') return 'localhost:5000';
      return undefined;
    },
  };
  const res = {
    status(status) { result.status = status; return this; },
    json(body) { result.body = body; return this; },
    send(body) { result.body = body; return this; },
    sendStatus(status) { result.status = status; return this; },
    set(key, value) { result.headers[key] = value; return this; },
  };
  let index = 0;
  const next = async () => {
    const handler = entry.handlers[index++];
    if (handler) return handler(req, res, next);
  };
  await next();
  return result;
}

// Check model metadata and fixture validity without opening a MongoDB connection.
async function main() {
  const Event = load('backend/src/models/Event.js');
  const AuthSession = load('backend/src/models/AuthSession.js');
  assert.equal(Event.collection.name, 'eventList');
  assert.equal(AuthSession.collection.name, 'AuthSessions');
  assert.equal(Event.schema.path('hostId').options.ref, 'User');
  assert.equal(Event.schema.path('imageData').options.select, false);
  assert.ok(AuthSession.schema.indexes().some(([keys, options]) => keys.expiresAt === 1 && options.expireAfterSeconds === 0));
  checked();

  const owner = '6ae7814e7d5f88664b48dc90';
  const fixtureDir = path.join(templateRoot, 'backend/scripts/fixtures');
  const fixtures = JSON.parse(fs.readFileSync(path.join(fixtureDir, 'sample-events.json'), 'utf8'));
  assert.equal(fixtures.length, 7);
  assert.equal(new Set(fixtures.map(item => item.seedKey)).size, 7);
  const records = await Promise.all(fixtures.map(async (item, index) => {
    const { imageFile, ...fields } = item;
    const imageData = fs.readFileSync(path.join(fixtureDir, imageFile));
    assert.ok(imageData.length <= 1024 * 1024);
    assert.equal(imageData.readUInt16BE(0), 0xffd8);
    const doc = new Event({
      ...fields, _id: new mongoose.Types.ObjectId(), hostId: owner,
      startsAt: new Date(fields.startsAt), endsAt: new Date(fields.endsAt),
      imageData, imageMimeType: 'image/jpeg',
    });
    await doc.validate();
    assert.ok(doc.endsAt > doc.startsAt);
    checked();
    return doc.toObject();
  }));

  // Verify serialization exposes display fields and image URLs, excluding raw image bytes.
  const data = load('backend/src/services/eventData.js');
  const dto = data.toEventItem(records[0], 'http://localhost:5000/api');
  assert.equal(dto.hostId, owner);
  assert.equal(dto.category, 'Music');
  assert.ok(dto.bannerImage.endsWith('/image'));
  assert.equal('imageData' in dto, false);
  assert.equal(dto.priceAmount, 45);
  assert.equal(data.toEventItem(records[1], 'http://localhost:5000/api').price, 'Free');
  assert.ok(data.toEventItem(records[2], 'http://localhost:5000/api').time.includes('ends'));
  checked();

  // Include forged ownership fields to confirm the parser never accepts them.
  const valid = {
    title: ' Future demo ', category: 'Music', description: 'Demo description',
    price: 12.34, startsAt: new Date(Date.now() + 86400000).toISOString(),
    endsAt: new Date(Date.now() + 90000000).toISOString(),
    timeZone: 'America/New_York', address: 'DEMO: 10 Fictional Street',
    place: 'Demo Hall', latitude: 40.7, longitude: -74,
    imageBase64: records[0].imageData.toString('base64'),
    hostId: '507f1f77bcf86cd799439011', seedKey: 'attacker-key',
  };
  const parsed = data.parseCreateEvent(valid);
  assert.equal(parsed.price, 12.34);
  assert.equal(parsed.title, 'Future demo');
  assert.equal('hostId' in parsed, false);
  assert.equal('seedKey' in parsed, false);
  assert.equal(parsed.imageMimeType, 'image/jpeg');
  checked();
  // Exercise rejected prices, schedules, coordinates, categories, and oversized image input.
  for (const invalid of [
    { ...valid, category: 'All' }, { ...valid, price: NaN }, { ...valid, price: -1 },
    { ...valid, price: 12.345 }, { ...valid, startsAt: 'bad-date' },
    { ...valid, startsAt: '2000-01-01T00:00:00Z' }, { ...valid, endsAt: valid.startsAt },
    { ...valid, timeZone: 'Fake/Zone' }, { ...valid, latitude: 200 },
    { ...valid, imageBase64: 'not base64' }, { ...valid, imageBase64: 'A'.repeat(1500000) },
  ]) {
    assert.throws(() => data.parseCreateEvent(invalid), error => error.name === 'EventInputError');
    checked();
  }

  // Replace session persistence with an array while exercising the real token/expiry middleware.
  let userExists = true;
  const sessions = [];
  const sessionStore = {
    async init() {},
    async create(input) { sessions.push({ _id: String(sessions.length + 1), ...input }); },
    async findOne(query) {
      return sessions.find(session => session.tokenHash === query.tokenHash && session.expiresAt > query.expiresAt.$gt) || null;
    },
    async deleteOne(query) {
      const index = sessions.findIndex(session => session._id === query._id);
      if (index >= 0) sessions.splice(index, 1);
    },
  };
  const auth = load('backend/src/middleware/requireAuth.js', {
    '../models/AuthSession': sessionStore,
    '../models/User': { async exists() { return userExists; } },
  });
  const session = await auth.createSession(owner);
  assert.match(session.accessToken, /^[a-f0-9]{64}$/);
  assert.equal(sessions[0].tokenHash, auth.hashToken(session.accessToken));
  assert.notEqual(sessions[0].tokenHash, session.accessToken);
  assert.equal('accessToken' in sessions[0], false);
  checked();

  // Simulate event reads and writes so route tests can inspect exactly what would be saved.
  const db = records.slice();
  let write;
  const router = fakeRouter();
  load('backend/src/routes/events.js', {
    express: { Router: () => router },
    '../middleware/requireAuth': auth,
    '../models/Event': {
      find(filter) {
        const values = filter.hostId ? db.filter(event => String(event.hostId) === String(filter.hostId)) : db;
        return { sort() { return this; }, async lean() { return values; } };
      },
      findById(id) {
        const record = db.find(event => String(event._id) === id);
        return { async lean() { return record; }, async select(value) { assert.equal(value, '+imageData'); return record; } };
      },
      async create(fields) {
        write = fields;
        const record = { _id: new mongoose.Types.ObjectId(), ...fields };
        db.unshift(record);
        return record;
      },
    },
  });
  assert.equal((await invoke(router, 'POST', '/', { body: valid })).status, 401);
  checked();
  const created = await invoke(router, 'POST', '/', { token: session.accessToken, body: valid });
  assert.equal(created.status, 201);
  assert.equal(String(write.hostId), owner);
  assert.equal(created.body.event.hostId, owner);
  assert.equal('imageData' in created.body.event, false);
  assert.equal('seedKey' in write, false);
  checked();
  const listed = await invoke(router, 'GET', '/');
  assert.equal(listed.body.events.length, 8);
  assert.equal(listed.body.events[0].id, created.body.event.id);
  checked();
  const mine = await invoke(router, 'GET', '/mine', { token: session.accessToken });
  assert.ok(mine.body.events.every(event => event.hostId === owner));
  checked();
  assert.equal((await invoke(router, 'POST', '/', { token: session.accessToken, body: { ...valid, category: 'All' } })).status, 400);
  checked();
  const details = await invoke(router, 'GET', '/:id', { params: { id: created.body.event.id } });
  assert.equal(details.body.event.id, created.body.event.id);
  checked();
  assert.equal((await invoke(router, 'GET', '/:id', { params: { id: 'bad-id' } })).status, 400);
  assert.equal((await invoke(router, 'GET', '/:id', { params: { id: '507f1f77bcf86cd799439011' } })).status, 404);
  checked();
  const image = await invoke(router, 'GET', '/:id/image', { params: { id: created.body.event.id } });
  assert.equal(image.headers['Content-Type'], 'image/jpeg');
  assert.ok(Buffer.isBuffer(image.body));
  checked();
  assert.equal((await invoke(router, 'GET', '/mine', { token: 'f'.repeat(64) })).status, 401);
  checked();
  sessions[0].expiresAt = new Date(Date.now() - 1000);
  assert.equal((await invoke(router, 'GET', '/mine', { token: session.accessToken })).status, 401);
  checked();
  const nextSession = await auth.createSession(owner);
  userExists = false;
  assert.equal((await invoke(router, 'GET', '/mine', { token: nextSession.accessToken })).status, 401);
  userExists = true;
  checked();

  // Use a real Argon2 hash to test login verification, token issuance, and logout invalidation.
  const account = { _id: owner, firstName: 'Demo', lastName: 'Host', username: 'demo', email: 'demo@example.com',
    passwordHash: await argon2.hash('a long demo passphrase 2026') };
  const authRouter = fakeRouter();
  load('backend/src/routes/auth.js', {
    express: { Router: () => authRouter },
    '../middleware/requireAuth': auth,
    '../models/AuthSession': sessionStore,
    '../models/User': {
      findOne() { return { async select(value) { assert.equal(value, '+passwordHash'); return account; } }; },
      findById() { return { async select() { const { passwordHash, ...safe } = account; return safe; } }; },
    },
  });
  const loggedIn = await invoke(authRouter, 'POST', '/login', { body: { email: 'demo@example.com', password: 'a long demo passphrase 2026' } });
  assert.equal(loggedIn.status, 200);
  assert.match(loggedIn.body.accessToken, /^[a-f0-9]{64}$/);
  assert.equal('passwordHash' in loggedIn.body.user, false);
  checked();
  assert.equal((await invoke(authRouter, 'POST', '/login', { body: { email: 'demo@example.com', password: 'wrong' } })).status, 401);
  checked();
  assert.equal((await invoke(authRouter, 'POST', '/logout', { token: loggedIn.body.accessToken })).status, 204);
  assert.equal((await invoke(router, 'GET', '/mine', { token: loggedIn.body.accessToken })).status, 401);
  checked();

  // Model seed-key upserts in memory, preserving the first inserted value for each key.
  const seeded = new Map();
  function SeedEvent(input) { this.validate = () => new Event(input).validate(); }
  SeedEvent.init = async () => {};
  SeedEvent.countDocuments = async () => seeded.size;
  SeedEvent.bulkWrite = async operations => {
    let upsertedCount = 0;
    for (const operation of operations) {
      const { filter, update, upsert, timestamps } = operation.updateOne;
      assert.equal(upsert, true);
      assert.equal(timestamps, false);
      assert.ok(update.$setOnInsert);
      if (!seeded.has(filter.seedKey)) {
        seeded.set(filter.seedKey, update.$setOnInsert);
        upsertedCount++;
      }
    }
    return { upsertedCount };
  };
  // Replace the script's automatic entry point so the test can call it with mocked dependencies.
  const seeder = load('backend/scripts/seedEvents.js', {
    mongoose: { Types: mongoose.Types, async connect() {}, async disconnect() {} },
    dotenv: { config() {} },
    '../src/models/Event': SeedEvent,
    '../src/models/User': { async exists() { return true; } },
  }, (source, file) => file.endsWith('seedEvents.js')
    ? source.replace(/\nseedEvents\(\)\n[\s\S]*$/, '\nmodule.exports = { seedEvents };\n')
    : source);
  const originalUri = process.env.MONGO_URI;
  process.env.MONGO_URI = 'mongodb://mock-only-not-connected';
  try {
    // Running twice must preserve all seven originals rather than insert duplicates or replace data.
    await seeder.seedEvents();
    const first = JSON.stringify([...seeded.values()]);
    await seeder.seedEvents();
    assert.equal(seeded.size, 7);
    assert.equal(JSON.stringify([...seeded.values()]), first);
    assert.ok([...seeded.values()].every(event => String(event.hostId) === owner));
    checked();
  } finally {
    if (originalUri === undefined) delete process.env.MONGO_URI;
    else process.env.MONGO_URI = originalUri;
  }
  console.log(JSON.stringify({ passedChecks: checks, database: 'mocked', atlasAccessed: false, projectFilesWritten: 0 }));
}
require('node:test').test('Event, session, image, API, and idempotent seed workflow', async () => {
  await main();
});
