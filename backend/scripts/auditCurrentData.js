// Administrative, read-only audit. Print counts and field names, never credentials or contacts.
const path = require('node:path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env'), quiet: true });
const mongoose = require('mongoose');
const LEGACY = {
  AccountList: ['phone', 'dob', 'bio', 'password', 'passwordHash', 'authVersion', 'mfaEnabled', 'mfaSecretEncrypted', 'mfaRecoveryCodeHashes', 'avatarData', 'avatarMimeType', 'avatarUrl', 'avatar', 'profilePicture'],
  eventList: ['category', 'date', 'time', 'venue', 'bannerImage', 'imageData', 'imageBase64', 'imageMimeType', 'photos'],
  StoreList: ['imageData', 'imageBase64', 'imageMimeType', 'photos'],
};
const KEYS = {
  UserProfiles: ['userId'], AccountSecurity: ['userId'], UserAvatars: ['userId'],
  EventPhotos: ['eventId', 'displayOrder'], StorePhotos: ['storeId', 'displayOrder'],
  EventSelections: ['userId', 'eventId'], eventRatings: ['userId', 'eventId'],
  organizerFollows: ['userId', 'organizerId'], NotificationSettings: ['userId'], notifications: ['dedupeKey'],
};
async function main() {
  const deadline = setTimeout(() => { console.error('Data audit timed out.'); process.exit(1); }, 45000);
  try {
    mongoose.set('autoCreate', false); mongoose.set('autoIndex', false);
    await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 10000, connectTimeoutMS: 8000 });
    const db = mongoose.connection.db;
    const names = (await db.listCollections({}, { nameOnly: true }).toArray()).map(row => row.name).sort();
    const collections = [];
    for (const name of names) collections.push({ name, count: await db.collection(name).countDocuments({}) });
    const legacyFields = [];
    for (const [name, fields] of Object.entries(LEGACY)) for (const field of fields) {
      const count = await db.collection(name).countDocuments({ [field]: { $exists: true } });
      if (count) legacyFields.push({ collection: name, field, count });
    }
    const duplicates = [];
    for (const [name, fields] of Object.entries(KEYS)) {
      const groups = await db.collection(name).aggregate([
        { $group: { _id: Object.fromEntries(fields.map(field => [field, '$' + field])), n: { $sum: 1 } } },
        { $match: { n: { $gt: 1 } } }, { $group: { _id: null, groups: { $sum: 1 }, redundant: { $sum: { $subtract: ['$n', 1] } } } },
      ]).toArray();
      if (groups.length) duplicates.push({ collection: name, ...groups[0] });
    }
    const reverseFriendships = await db.collection('friendships').aggregate([
      { $project: { pair: { $cond: [{ $lt: ['$requester', '$recipient'] }, ['$requester', '$recipient'], ['$recipient', '$requester']] } } },
      { $group: { _id: '$pair', n: { $sum: 1 } } }, { $match: { n: { $gt: 1 } } }, { $count: 'groups' },
    ]).toArray();
    const identities = await db.collection('AccountList').find({}, { projection: { _id: 1, username: 1 } }).toArray();
    const identityIds = identities.map(user => user._id);
    const missingProfiles = [], missingSecurity = [];
    for (const user of identities) {
      if (!(await db.collection('UserProfiles').findOne({ userId: user._id }, { projection: { _id: 1 } }))) missingProfiles.push(user.username);
      if (!(await db.collection('AccountSecurity').findOne({ userId: user._id }, { projection: { _id: 1 } }))) missingSecurity.push(user.username);
    }
    const orphanEventHosts = await db.collection('eventList').countDocuments({ hostId: { $nin: identityIds } });
    console.log(JSON.stringify({ collections, legacyFields, duplicates, duplicateFriendPairs: reverseFriendships[0]?.groups || 0,
      missingProfiles, missingSecurity, orphanEventHosts }, null, 2));
  } catch (error) { console.error('Data audit failed:', error.name); process.exitCode = 1; }
  finally { await mongoose.disconnect(); clearTimeout(deadline); }
}
main();
