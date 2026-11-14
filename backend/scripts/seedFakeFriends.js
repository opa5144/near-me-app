require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const mongoose = require('mongoose');
const Friendship = require('../src/models/Friendship'); 
const Account = require('../src/models/User');
const Event = require('../src/models/Event');

const DEFAULT_AVATAR = 'https://static.vecteezy.com/system/resources/previews/077/167/094/non_2x/simple-icon-of-a-person-with-a-round-head-and-rounded-body-vector.jpg';

async function seedFakeProfiles() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to MongoDB for fake profile seeding...');

    // 1. Find your real logged-in account
    const myEmail = 'deminubi@gmail.com'; // <-- REPLACE WITH YOUR LOGIN EMAIL
    const myAccount = await Account.findOne({ email: myEmail });

    if (!myAccount) {
      console.log(`❌ Account with email "${myEmail}" not found. Please update \`myEmail\` in the script!`);
      process.exit(1);
    }

    console.log(`Found your account: @${myAccount.username} (${myAccount._id})`);

    // 2. Define fake test users
    const fakeUserData = [
      { firstName: 'Alice', lastName: 'Test', username: 'alicetest', email: 'alice@test.com' },
      { firstName: 'Bob', lastName: 'Demo', username: 'bobdemo', email: 'bob@test.com' },
      { firstName: 'Charlie', lastName: 'Mock', username: 'charliemock', email: 'charlie@test.com' },
    ];

    const fakeAccountIds = [];

    // 3. Create or find the fake accounts so we don't duplicate them on re-runs
    for (const data of fakeUserData) {
      let user = await Account.findOne({ email: data.email });
      if (!user) {
        user = await Account.create({
          ...data,
          password: 'fakepassword123', // Dummy password
          avatarUrl: DEFAULT_AVATAR,
        });
        console.log(`👤 Created fake user: @${user.username}`);
      } else {
        console.log(`👤 Fake user already exists: @${user.username}`);
      }
      fakeAccountIds.push(user._id);
    }

    // 4. Clear out old friendships between you and these fake users for a clean slate
    await Friendship.deleteMany({
      $or: [
        { requester: myAccount._id, recipient: { $in: fakeAccountIds } },
        { recipient: myAccount._id, requester: { $in: fakeAccountIds } },
      ],
    });

    // 5. Establish Test Relationships:
    // Alice -> Accepted Friend (Tests "Friends" button & FriendAvatarStack)
    await Friendship.create({
      requester: myAccount._id,
      recipient: fakeAccountIds[0],
      status: 'accepted',
    });
    console.log(`🤝 Linked @${fakeUserData[0].username} as an Accepted Friend.`);

    // Bob -> Incoming Request (Tests incoming request badge/accept screen)
    await Friendship.create({
      requester: fakeAccountIds[1],
      recipient: myAccount._id,
      status: 'pending',
    });
    console.log(`📥 Created Incoming Request from @${fakeUserData[1].username}.`);

    // Charlie -> Outgoing Request (Tests "Requested" button state)
    await Friendship.create({
      requester: myAccount._id,
      recipient: fakeAccountIds[2],
      status: 'pending',
    });
    console.log(`📤 Created Outgoing Request to @${fakeUserData[2].username}.`);

    // 6. Make Alice the host of a sample event so you can test the profile modal & host routing
    const sampleEvent = await Event.findOne();
    if (sampleEvent) {
      sampleEvent.hostId = fakeAccountIds[0];
      await sampleEvent.save();
      console.log(`🎪 Set event "${sampleEvent.title}" host to @${fakeUserData[0].username}.`);
    }

    console.log('\n🎉 Fake profiles and default test relationships successfully seeded!');
    process.exit(0);
  } catch (error) {
    console.error('Seeding error:', error);
    process.exit(1);
  }
}

seedFakeProfiles();