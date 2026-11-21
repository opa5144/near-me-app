const mongoose = require('mongoose');
const Event = require('./Event');
const PastEvent = require('./PastEvent');
const ArchivedEvent = require('./ArchivedEvent');

const collections = [
  { model: Event, storage: 'current' }, { model: PastEvent, storage: 'past' },
  { model: ArchivedEvent, storage: 'archived' },
];

// A snapshot cannot miss an ID while another transaction relocates it.
function withEventSnapshot(session, read) {
  return session ? read(session) : mongoose.connection.transaction(read, { readConcern: { level: 'snapshot' } });
}

async function findEvents(filter = {}, { session, select, populate, sort } = {}) {
  return withEventSnapshot(session, async snapshot => {
    const result = new Map();
    for (const { model, storage } of collections) {
      const query = model.find(filter).session(snapshot);
      if (select) query.select(select);
      if (sort) query.sort(sort);
      if (populate) query.populate(populate);
      for (const row of await query.lean()) {
        if (result.has(String(row._id))) throw new Error('Duplicate event ID across lifecycle collections.');
        result.set(String(row._id), { ...row, storage });
      }
    }
    return [...result.values()];
  });
}

async function findEventById(id, options = {}) {
  return (await findEvents({ _id: id }, options))[0] || null;
}

function modelFor(event) {
  return collections.find(entry => entry.storage === event.storage)?.model || Event;
}

// Caller owns the host fence. Insert and delete commit together, retaining all
// original fields, timestamps and references. A conflict never overwrites data.
async function relocateEvent(event, targetStorage, session, changes = {}) {
  if (!session?.inTransaction()) throw new Error('Event moves require an active transaction.');
  const target = collections.find(entry => entry.storage === targetStorage);
  if (!target) throw new Error('Unknown event collection.');
  const source = modelFor(event);
  const { storage, ...document } = event;
  const moved = { ...document, ...changes };
  if (source === target.model) {
    await source.collection.replaceOne({ _id: document._id }, moved, { session });
  } else {
    const collision = await target.model.collection.findOne({ _id: document._id }, { session, projection: { _id: 1 } });
    if (collision) throw new Error('Destination contains this event ID; no records were overwritten.');
    await target.model.collection.insertOne(moved, { session });
    const deleted = await source.collection.deleteOne({ _id: document._id }, { session });
    if (deleted.deletedCount !== 1) throw new Error('Event changed during relocation.');
  }
  return { ...moved, storage: targetStorage };
}

async function initializeEventModels() {
  for (const { model } of collections) await model.init();
}

module.exports = { collections, findEvents, findEventById, modelFor, relocateEvent, withEventSnapshot, initializeEventModels };
