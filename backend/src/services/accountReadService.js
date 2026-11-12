const User = require('../models/User');
const UserProfile = require('../models/UserProfile');
const UserAvatar = require('../models/UserAvatar');
const { ServiceError } = require('./serviceError');

// Public identity responses use an explicit field allowlist.
const IDENTITY_FIELDS = '_id firstName lastName username email deletedAt createdAt updatedAt';

async function avatarUrlsForUsers(ids, baseUrl, { session } = {}) {
  const uniqueIds = [...new Set(ids.map(id => String(id)))];
  if (!uniqueIds.length || typeof baseUrl !== 'string' || !baseUrl) return new Map();
  const avatars = await UserAvatar.find({ userId: { $in: uniqueIds } }).select('userId').session(session ?? null).lean();
  const root = baseUrl.replace(/\/$/, '');
  return new Map(avatars.map(avatar => [String(avatar.userId), root + '/users/' + avatar.userId + '/avatar']));
}

// Services assemble public account data from split collections, never from old copies.
async function readUserProfile(userId, baseUrl, { session, activeOnly = true } = {}) {
  const identity = await User.findOne({ _id: userId, ...(activeOnly ? { deletedAt: null } : {}) })
    .select(IDENTITY_FIELDS).session(session ?? null).lean();
  if (!identity) return null;
  const profile = await UserProfile.findOne({ userId }).select('phone bio dob').session(session ?? null).lean();
  if (!profile) throw new ServiceError(503, 'Your account profile is unavailable. Please contact support.');
  // Keep transaction-bound operations sequential on the same MongoDB session.
  const avatarUrls = await avatarUrlsForUsers([userId], baseUrl, { session });
  return {
    _id: identity._id, firstName: identity.firstName, lastName: identity.lastName,
    username: identity.username, email: identity.email,
    phone: profile.phone ?? '', bio: profile.bio ?? '', dob: profile.dob ?? '',
    avatarUrl: avatarUrls.get(String(userId)) ?? '',
    deletedAt: identity.deletedAt ?? null, createdAt: identity.createdAt, updatedAt: identity.updatedAt,
  };
}

module.exports = { IDENTITY_FIELDS, readUserProfile, avatarUrlsForUsers };
