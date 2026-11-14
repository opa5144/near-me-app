require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const mongoose = require('mongoose');
const Friendship = require('../src/models/Friendship');
const Account = require('../src/models/User');

async function cleanup() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected for cleanup...');

    // Find all fake test accounts by their domain
    const fakeEmails = ['alice@test.com', 'bob@test.com', 'charlie@test.com'];
    const fakeUsers = await Account.find({ email: { $in: fakeEmails } });
    const fakeIds = fakeUsers.map(u => u._id);

    // Delete friendships connected to them
    const deletedFriendships = await Friendship.deleteMany({
      $or: [
        { requester: { $in: fakeIds } },
        { recipient: { $in: fakeIds } },
      ],
    });
    console.log(`🧹 Deleted ${deletedFriendships.deletedCount} test friendships.`);

    // Delete the fake user accounts themselves
    const deletedUsers = await Account.deleteMany({ email: { $in: fakeEmails } });
    console.log(`🧹 Deleted ${deletedUsers.deletedCount} fake user accounts.`);

    console.log('✨ Cleanup complete! Your database is back to normal.');
    process.exit(0);
  } catch (error) {
    console.error('Cleanup error:', error);
    process.exit(1);
  }
}

cleanup();