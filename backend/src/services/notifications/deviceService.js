const { createHash } = require('node:crypto');
const PushDevice = require('../../models/PushDevice');
const User = require('../../models/User');
const { getNotificationConfig } = require('../../config/notifications');
const { withActiveAccountWrite } = require('../activeAccountWrite');
const { ServiceError } = require('../serviceError');

const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;

function deviceDto(device) {
  return {
    id: String(device._id), platform: device.platform, projectId: device.projectId,
    lastSeenAt: device.lastSeenAt, active: device.active === true,
  };
}

function registration(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body) ||
      Object.keys(body).some(key => !['token', 'installationId', 'projectId', 'platform'].includes(key)) ||
      typeof body.token !== 'string' || !/^(?:ExpoPushToken|ExponentPushToken)\[[A-Za-z0-9_-]{1,200}\]$/.test(body.token) ||
      typeof body.installationId !== 'string' || !UUID.test(body.installationId) ||
      typeof body.projectId !== 'string' || !UUID.test(body.projectId) || !['android', 'ios'].includes(body.platform)) {
    throw new ServiceError(400, 'Submit a valid Expo token, installation UUID, project UUID, and mobile platform.');
  }
  const configuredProject = getNotificationConfig().expo.projectId.trim().toLowerCase();
  if (!configuredProject) throw new ServiceError(503, 'Push registration is unavailable until the server project is configured.');
  if (body.projectId.toLowerCase() !== configuredProject) throw new ServiceError(400, 'The push project does not match this application.');
  return {
    token: body.token, tokenHash: createHash('sha256').update(body.token).digest('hex'),
    installationId: body.installationId.toLowerCase(), projectId: configuredProject, platform: body.platform,
  };
}

async function listDevices(auth) {
  if (!(await User.exists({ _id: auth.userId, deletedAt: null }))) throw new ServiceError(401, 'Please log in again.');
  const devices = await PushDevice.find({ userId: auth.userId, active: true })
    .select('_id platform projectId lastSeenAt active').sort({ lastSeenAt: -1, _id: -1 }).lean();
  return { devices: devices.map(deviceDto) };
}

async function registerDevice(auth, body) {
  const input = registration(body);
  await PushDevice.init();
  try {
    return await withActiveAccountWrite(auth, [], async session => {
      const existing = await PushDevice.findOne({ tokenHash: input.tokenHash }).session(session).lean();
      // A fresh token replaces this user's old token for the same installation.
      // Token ownership may transfer on sign-in; no former User record is edited.
      await PushDevice.updateMany({
        userId: auth.userId, installationId: input.installationId, active: true, tokenHash: { $ne: input.tokenHash },
      }, { $set: { active: false, disabledReason: 'replaced' } }, { session });
      const alreadyActive = existing && String(existing.userId) === String(auth.userId) && existing.active === true;
      const activeCount = await PushDevice.countDocuments({ userId: auth.userId, active: true }).session(session);
      if (!alreadyActive && activeCount >= 10) {
        throw new ServiceError(409, 'You can register up to ten active push devices. Remove one and try again.');
      }
      const saved = await PushDevice.findOneAndUpdate({ tokenHash: input.tokenHash }, { $set: {
        ...input, userId: auth.userId, active: true, lastSeenAt: new Date(), disabledReason: null,
      } }, { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true, session }).lean();
      return { device: deviceDto(saved) };
    });
  } catch (error) {
    if (error?.code === 11000) throw new ServiceError(409, 'Push registration changed concurrently. Please try again.');
    throw error;
  }
}

async function disableDevice(auth, id, body) {
  if (typeof id !== 'string' || !/^[a-f0-9]{24}$/i.test(id)) throw new ServiceError(400, 'Choose a valid device.');
  if (body !== undefined && (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length)) {
    throw new ServiceError(400, 'Removing a push device accepts no fields.');
  }
  return withActiveAccountWrite(auth, [], async session => {
    const saved = await PushDevice.findOneAndUpdate({ _id: id, userId: auth.userId }, {
      $set: { active: false, disabledReason: 'user_disabled' },
    }, { new: true, session, runValidators: true }).lean();
    if (!saved) throw new ServiceError(404, 'Device not found.');
  });
}

module.exports = { listDevices, registerDevice, disableDevice };
