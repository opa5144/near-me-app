const User = require('../models/User');
const { ServiceError } = require('./serviceError');

async function updateUserProfile(auth, input, publicApiBaseUrl) {
  const { avatarBase64, imageMimeType, firstName, lastName } = input;
  const updateData = {};
  if (firstName !== undefined) updateData.firstName = firstName.trim();
  if (lastName !== undefined) updateData.lastName = lastName.trim();

  // Store durable avatar bytes; the controller supplies a device-accessible API base.
  if (avatarBase64) {
    updateData.avatarData = Buffer.from(avatarBase64, 'base64');
    updateData.avatarMimeType = imageMimeType || 'image/jpeg';
    updateData.avatarUrl = `${publicApiBaseUrl}/users/${auth.userId}/avatar`;
  }

  const user = await User.findOneAndUpdate({
    _id: auth.userId,
    deletedAt: null,
    $expr: { $eq: [{ $ifNull: ['$authVersion', 0] }, auth.authVersion ?? 0] },
  }, { $set: updateData }, { returnDocument: 'after', runValidators: true });
  if (!user) throw new ServiceError(404, 'User not found.');
  return user;
}

async function fetchUserAvatar(userId) {
  const user = await User.findOne({ _id: userId, deletedAt: null }).select('+avatarData +avatarMimeType');
  if (!user || !user.avatarData || !user.avatarMimeType) {
    throw new ServiceError(404, 'Avatar not found.');
  }
  return { data: user.avatarData, mimeType: user.avatarMimeType };
}

async function fetchCurrentUser(userId) {
  const user = await User.findOne({ _id: userId, deletedAt: null });
  if (!user) throw new ServiceError(404, 'User not found.');
  return user;
}

module.exports = { updateUserProfile, fetchUserAvatar, fetchCurrentUser };
