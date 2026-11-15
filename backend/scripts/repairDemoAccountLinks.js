// Add missing split records for the three known friend fixtures. Never reset an existing credential.
const path = require('node:path');
const fs = require('node:fs');
const { randomBytes } = require('node:crypto');
const argon2 = require('argon2');
require('dotenv').config({ path: path.resolve(__dirname, '../.env'), quiet: true });
const mongoose = require('mongoose');
const FIXTURES = [
  { username: 'alicetest', email: 'alice@test.com', firstName: 'Alice', lastName: 'Test' },
  { username: 'bobdemo', email: 'bob@test.com', firstName: 'Bob', lastName: 'Demo' },
  { username: 'charliemock', email: 'charlie@test.com', firstName: 'Charlie', lastName: 'Mock' },
];
async function main() {
  const deadline = setTimeout(() => { console.error('Demo-account repair timed out.'); process.exit(1); }, 45000);
  try {
    mongoose.set('autoCreate', false); mongoose.set('autoIndex', false);
    await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 10000, connectTimeoutMS: 8000 });
    const db = mongoose.connection.db;
    const plans = [];
    for (const fixture of FIXTURES) {
      const user = await db.collection('AccountList').findOne({ ...fixture, deletedAt: null }, { projection: { _id: 1, username: 1 } });
      if (!user) throw new Error('UnexpectedDemoIdentity');
      const profileMissing = !(await db.collection('UserProfiles').findOne({ userId: user._id }, { projection: { _id: 1 } }));
      const securityMissing = !(await db.collection('AccountSecurity').findOne({ userId: user._id }, { projection: { _id: 1 } }));
      // A discarded random secret preserves these fixtures' existing inability to sign in.
      const passwordHash = securityMissing ? await argon2.hash(randomBytes(64), { type: argon2.argon2id }) : null;
      plans.push({ user, profileMissing, securityMissing, passwordHash });
    }
    let inserted = { profiles: 0, security: 0 };
    if (process.argv.includes('--apply')) {
      const backupRoot = path.resolve(__dirname, '../.local-backups');
      fs.mkdirSync(backupRoot, { recursive: true });
      const manifestPath = path.join(backupRoot, 'demo-account-links-' + Date.now() + '.json');
      fs.writeFileSync(manifestPath, JSON.stringify({ createdAt: new Date(),
        records: plans.map(plan => ({ userId: String(plan.user._id), username: plan.user.username,
          profileMissing: plan.profileMissing, securityMissing: plan.securityMissing })),
      }, null, 2), { mode: 0o600, flag: 'wx' });
      inserted = await mongoose.connection.transaction(async session => {
        const counts = { profiles: 0, security: 0 };
        for (const plan of plans) {
          const locked = await db.collection('AccountList').updateOne({ _id: plan.user._id, deletedAt: null }, { $inc: { archiveWriteVersion: 1 } }, { session });
          if (!locked.matchedCount) throw new Error('DemoAccountUnavailable');
          const now = new Date();
          if (plan.profileMissing) {
            const result = await db.collection('UserProfiles').updateOne({ userId: plan.user._id }, { $setOnInsert: {
              _id: new mongoose.Types.ObjectId(), userId: plan.user._id, phone: '', bio: '', dob: '', createdAt: now, updatedAt: now,
            } }, { upsert: true, session });
            counts.profiles += result.upsertedCount;
          }
          if (plan.securityMissing) {
            const result = await db.collection('AccountSecurity').updateOne({ userId: plan.user._id }, { $setOnInsert: {
              _id: new mongoose.Types.ObjectId(), userId: plan.user._id, passwordHash: plan.passwordHash, authVersion: 0,
              mfaEnabled: false, mfaRecoveryCodeHashes: [], mfaLastUsedStep: -1, mfaFailedAttempts: 0, mfaLockedUntil: null,
              securityPasswordFailedAttempts: 0, securityPasswordLockedUntil: null,
              loginPasswordFailedAttempts: 0, loginPasswordLockedUntil: null, createdAt: now, updatedAt: now,
            } }, { upsert: true, session });
            counts.security += result.upsertedCount;
          }
        }
        return counts;
      });
    }
    console.log(JSON.stringify({ mode: process.argv.includes('--apply') ? 'applied' : 'preview', inserted,
      accounts: plans.map(plan => ({ username: plan.user.username, profileMissingBefore: plan.profileMissing, securityMissingBefore: plan.securityMissing })),
    }, null, 2));
  } catch (error) { console.error('Demo-account repair failed:', error.name); process.exitCode = 1; }
  finally { await mongoose.disconnect(); clearTimeout(deadline); }
}
main();
