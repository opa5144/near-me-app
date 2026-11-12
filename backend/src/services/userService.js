const User = require('../models/User');
const UserAvatar = require('../models/UserAvatar');
const { withActiveAccountWrite } = require('./activeAccountWrite');
const { readUserProfile } = require('./accountReadService');
const { ServiceError } = require('./serviceError');

async function updateUserProfile(auth, input, publicApiBaseUrl) {
  const { avatarBase64, imageMimeType, firstName, lastName } = input;
  const identity = {};
  if (firstName !== undefined) identity.firstName = firstName.trim();
  if (lastName !== undefined) identity.lastName = lastName.trim();
  const avatar = avatarBase64 ? {
    avatarData: Buffer.from(avatarBase64, 'base64'),
    avatarMimeType: imageMimeType || 'image/jpeg',
  } : null;

  // Identity stays on User; avatar bytes belong only to UserAvatar. The shared
  // account fence makes both changes atomic with session changes and closure.
  return withActiveAccountWrite(auth, [], async session => {
    if (Object.keys(identity).length) {
      const updated = await User.updateOne({ _id: auth.userId, deletedAt: null },
        { $set: identity }, { runValidators: true, session });
      if (!updated.matchedCount) throw new ServiceError(404, 'User not found.');
    }
    if (avatar) {
      await UserAvatar.findOneAndUpdate({ userId: auth.userId }, {
        $set: avatar,
        $setOnInsert: { userId: auth.userId },
      }, { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true, session });
    }
    const user = await readUserProfile(auth.userId, publicApiBaseUrl, { session });
    if (!user) throw new ServiceError(404, 'User not found.');
    return user;
  });
}

async function fetchUserAvatar(userId) {
  const active = await User.exists({ _id: userId, deletedAt: null });
  if (!active) throw new ServiceError(404, 'Avatar not found.');
  const avatar = await UserAvatar.findOne({ userId }).select('+avatarData +avatarMimeType');
  if (!avatar || !avatar.avatarData || !avatar.avatarMimeType) {
    throw new ServiceError(404, 'Avatar not found.');
  }
  return { data: avatar.avatarData, mimeType: avatar.avatarMimeType };
}

async function fetchCurrentUser(userId, publicApiBaseUrl) {
  const user = await readUserProfile(userId, publicApiBaseUrl);
  if (!user) throw new ServiceError(404, 'User not found.');
  return user;
}

module.exports = { updateUserProfile, fetchUserAvatar, fetchCurrentUser };
