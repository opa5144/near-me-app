const fs = require('node:fs');
const path = require('node:path');
const mongoose = require('mongoose');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const Event = require('../src/models/Event');
const User = require('../src/models/User');

// All demo events belong to this existing AccountList user; this script creates no accounts.
const HOST_ID = '6ae7814e7d5f88664b48dc90';
// Fixture image paths are local inputs; their bytes are stored with each event in Atlas.
const fixtureDirectory = path.resolve(__dirname, 'fixtures');
const input = JSON.parse(fs.readFileSync(path.join(fixtureDirectory, 'sample-events.json'), 'utf8'));

// Run manually to insert the seven samples, preserving records already seeded with these keys.
async function seedEvents() {
  if (!process.env.MONGO_URI) throw new Error('Set MONGO_URI in backend/.env first.');
  if (input.length !== 7) throw new Error('Expected exactly seven sample event fixtures.');
  await mongoose.connect(process.env.MONGO_URI);

  const hostId = new mongoose.Types.ObjectId(HOST_ID);
  if (!(await User.exists({ _id: hostId }))) {
    throw new Error('The supplied host ID does not exist in AccountList. No events were inserted.');
  }
  // Create the unique sparse seed-key index before performing upserts.
  await Event.init();

  const seededAt = new Date();
  const documents = input.map(item => {
    const { imageFile, ...data } = item;
    // Keep fixture image reads inside the fixtures directory.
    const imagePath = path.resolve(fixtureDirectory, imageFile);
    if (!imagePath.startsWith(fixtureDirectory + path.sep)) throw new Error('Invalid fixture image path.');
    const imageData = fs.readFileSync(imagePath);
    if (imageData.length > 1024 * 1024) throw new Error('Fixture image is too large.');
    return {
      ...data,
      hostId,
      startsAt: new Date(data.startsAt),
      endsAt: new Date(data.endsAt),
      imageData,
      imageMimeType: 'image/jpeg',
      createdAt: seededAt,
      updatedAt: seededAt,
    };
  });
  // Validate before any write. Existing matching seed records remain untouched.
  for (const document of documents) {
    await new Event(document).validate();
  }
  // Insert only missing seed keys; do not overwrite existing edits or change their timestamps.
  const result = await Event.bulkWrite(documents.map(document => ({
    updateOne: {
      filter: { seedKey: document.seedKey },
      update: { $setOnInsert: document },
      upsert: true,
      timestamps: false,
    },
  })));
  console.log('Inserted ' + result.upsertedCount + ' demo events; existing matching samples were preserved.');
  console.log('Total seeded sample records: ' + await Event.countDocuments({ seedKey: { $in: input.map(item => item.seedKey) } }));
}

// Always close the database connection, including when validation or insertion fails.
seedEvents()
  .catch(err => {
    console.error('Event seed failed:', err.name, err.message);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
