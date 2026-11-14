const OrganizerFollow = require('../models/OrganizerFollow');
const User = require('../models/User');
const { withActiveAccountWrite } = require('./activeAccountWrite');
const { ServiceError } = require('./serviceError');

function target(auth, id, body) {
  if (typeof id !== 'string' || !/^[a-f0-9]{24}$/i.test(id)) throw new ServiceError(400, 'Choose a valid organizer.');
  const organizerId = id.toLowerCase();
  if (organizerId === String(auth.userId).toLowerCase()) throw new ServiceError(400, 'You cannot follow yourself.');
  if (body !== undefined && (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length)) {
    throw new ServiceError(400, 'Organizer follow requests accept no body fields.');
  }
  return organizerId;
}

function followDto(follow) {
  return { id: String(follow._id), organizerId: String(follow.organizerId), active: follow.active === true, followedAt: follow.followedAt };
}

async function listFollows(auth) {
  if (!(await User.exists({ _id: auth.userId, deletedAt: null }))) throw new ServiceError(401, 'Please log in again.');
  const follows = await OrganizerFollow.find({ userId: auth.userId, active: true }).sort({ followedAt: -1, _id: -1 }).lean();
  const activeOrganizers = await User.find({ _id: { $in: follows.map(follow => follow.organizerId) }, deletedAt: null })
    .select('_id firstName lastName username').lean();
  const organizers = new Map(activeOrganizers.map(user => [String(user._id), user]));
  return { follows: follows.filter(follow => organizers.has(String(follow.organizerId))).map(follow => {
    const organizer = organizers.get(String(follow.organizerId));
    return { ...followDto(follow), organizer: {
      id: String(organizer._id), firstName: organizer.firstName, lastName: organizer.lastName, username: organizer.username,
    } };
  }) };
}

async function followOrganizer(auth, id, body) {
  const organizerId = target(auth, id, body);
  await OrganizerFollow.init();
  return withActiveAccountWrite(auth, [organizerId], async session => {
    const filter = { userId: auth.userId, organizerId };
    const current = await OrganizerFollow.findOne(filter).session(session).lean();
    if (current?.active) return { follow: followDto(current) };
    const saved = await OrganizerFollow.findOneAndUpdate(filter, { $set: {
      active: true, followedAt: new Date(),
    } }, { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true, session }).lean();
    // Following changes future eligibility only; it never creates historical jobs.
    return { follow: followDto(saved) };
  });
}

async function unfollowOrganizer(auth, id, body) {
  const organizerId = target(auth, id, body);
  return withActiveAccountWrite(auth, [organizerId], async session => {
    await OrganizerFollow.updateOne({ userId: auth.userId, organizerId }, { $set: { active: false } }, { session, runValidators: true });
  });
}

module.exports = { listFollows, followOrganizer, unfollowOrganizer };
