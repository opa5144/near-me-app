const Notification = require('../../models/Notification');
const Delivery = require('../../models/NotificationDelivery');
const PushDevice = require('../../models/PushDevice');
const User = require('../../models/User');
const UserProfile = require('../../models/UserProfile');
const { getNotificationConfig } = require('../../config/notifications');
const { loadNotificationContext, allowedChannels } = require('./policyService');
const { renderStoredNotification } = require('./templates');
const { notificationKey } = require('./keys');
const providers = {
  email: require('../../providers/notifications/resend'),
  sms: require('../../providers/notifications/twilio'),
  push: require('../../providers/notifications/expoPush'),
};

function policyJob(notification) {
  return {
    userId: notification.userId, eventId: notification.eventId, actorId: notification.actorId,
    type: notification.type, dueAt: new Date(notification.data?.dueAt || notification.createdAt),
    expiresAt: notification.data?.expiresAt ? new Date(notification.data.expiresAt) : null,
    payload: notification.data?.payload || {},
  };
}

async function record(id, values, filter = {}) {
  await Delivery.updateOne({ _id: id, ...filter }, { $set: values });
}

function providerConfigured(channel, config) {
  if (channel === 'email') return Boolean(config.resend.apiKey && config.resend.from);
  if (channel === 'sms') return /^AC[0-9a-f]{32}$/i.test(config.twilio.accountSid) &&
    Boolean(config.twilio.authToken && (config.twilio.from || config.twilio.messagingServiceSid));
  return Boolean(config.expo.projectId && config.expo.accessToken);
}

async function deliver(deliveryId, { jobKey } = {}) {
  const delivery = await Delivery.findById(deliveryId).lean();
  if (!delivery) return { status: 'skipped', errorCode: 'DELIVERY_MISSING' };
  if (['accepted', 'delivered'].includes(delivery.status)) {
    return { status: delivery.status, receiptPending: delivery.channel === 'push' &&
      Boolean(delivery.providerMessageId) && !delivery.receiptCheckedAt };
  }
  if (['unknown', 'failed', 'skipped'].includes(delivery.status)) return { status: delivery.status, errorCode: delivery.errorCode };
  if (delivery.status === 'sending') {
    // A crashed process may already have sent it. Keep the ambiguous outcome for review.
    await record(deliveryId, { status: 'unknown', errorCode: 'INTERRUPTED_SEND' }, { status: 'sending' });
    return { status: 'unknown', errorCode: 'INTERRUPTED_SEND' };
  }
  const notification = await Notification.findOne({ _id: delivery.notificationId, userId: delivery.userId }).lean();
  const context = notification && await loadNotificationContext(policyJob(notification));
  const permitted = context && notification.channels.includes(delivery.channel) &&
    (await allowedChannels(delivery.userId, notification.type)).includes(delivery.channel);
  if (!permitted) {
    await record(deliveryId, { status: 'skipped', errorCode: 'NO_LONGER_ELIGIBLE' });
    return { status: 'skipped', errorCode: 'NO_LONGER_ELIGIBLE' };
  }
  const config = getNotificationConfig();
  if (!config.externalEnabled) {
    await record(deliveryId, { status: 'blocked', errorCode: 'EXTERNAL_DELIVERY_DISABLED' });
    return { status: 'blocked', errorCode: 'EXTERNAL_DELIVERY_DISABLED', retryAfterMs: 60000 };
  }
  if (!providerConfigured(delivery.channel, config)) {
    await record(deliveryId, { status: 'blocked', errorCode: 'PROVIDER_NOT_CONFIGURED' });
    return { status: 'blocked', errorCode: 'PROVIDER_NOT_CONFIGURED', retryAfterMs: 60000 };
  }
  // Resend retains idempotency keys for 24h. Stop before that window can expire.
  if (delivery.channel === 'email' && delivery.firstAttemptAt &&
      Date.now() - new Date(delivery.firstAttemptAt).getTime() >= 23 * 60 * 60 * 1000) {
    await record(deliveryId, { status: 'unknown', errorCode: 'IDEMPOTENCY_WINDOW_EXPIRED' });
    return { status: 'unknown', errorCode: 'IDEMPOTENCY_WINDOW_EXPIRED' };
  }
  let destination;
  if (delivery.channel === 'email') {
    const account = await User.findOne({ _id: delivery.userId, deletedAt: null }).select('email').lean();
    destination = account?.email;
    if (typeof destination !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(destination)) destination = null;
  } else if (delivery.channel === 'sms') {
    const profile = await UserProfile.findOne({ userId: delivery.userId }).select('phone').lean();
    const digits = (profile?.phone || '').replace(/\D/g, '');
    destination = /^[1-9]\d{7,14}$/.test(digits) ? '+' + digits : null;
  } else {
    const device = await PushDevice.findOne({ _id: delivery.deviceId, userId: delivery.userId, active: true,
      projectId: config.expo.projectId }).select('+token').lean();
    destination = device?.token;
  }
  if (!destination) {
    await record(deliveryId, { status: 'skipped', errorCode: 'DESTINATION_UNAVAILABLE' });
    return { status: 'skipped', errorCode: 'DESTINATION_UNAVAILABLE' };
  }
  const attemptedAt = new Date();
  const claimed = await Delivery.updateOne({ _id: deliveryId, status: { $in: ['pending', 'blocked'] } }, {
    $set: { status: 'sending', attemptedAt, firstAttemptAt: delivery.firstAttemptAt || attemptedAt, errorCode: null },
  });
  if (!claimed.modifiedCount) return { status: 'unknown', errorCode: 'DELIVERY_ALREADY_CLAIMED' };
  const providerConfig = config[{ email: 'resend', sms: 'twilio', push: 'expo' }[delivery.channel]];
  const result = await providers[delivery.channel].send({
    to: destination, content: renderStoredNotification(notification),
    key: jobKey || notificationKey('delivery', deliveryId),
  }, providerConfig);
  const status = result.status === 'retry' ? 'pending' : result.status;
  await record(deliveryId, { status, errorCode: result.errorCode || null,
    ...(result.messageId ? { providerMessageId: result.messageId } : {}),
    ...(result.status === 'accepted' ? { acceptedAt: new Date() } : {}),
  }, { status: { $in: ['sending', 'unknown'] }, attemptedAt });
  if (result.errorCode === 'EXPO_DeviceNotRegistered') {
    await PushDevice.updateOne({ _id: delivery.deviceId, userId: delivery.userId }, {
      $set: { active: false, disabledReason: 'DeviceNotRegistered' },
    });
  }
  return result;
}

async function checkPushReceipt(deliveryId) {
  const delivery = await Delivery.findById(deliveryId).lean();
  if (!delivery || delivery.channel !== 'push' || !delivery.providerMessageId) return { status: 'skipped', errorCode: 'RECEIPT_UNAVAILABLE' };
  if (['failed', 'skipped', 'unknown', 'delivered'].includes(delivery.status)) return { status: delivery.status, errorCode: delivery.errorCode };
  if (delivery.receiptCheckedAt) return { status: 'accepted', receiptPending: false };
  const config = getNotificationConfig();
  if (!config.externalEnabled) return { status: 'blocked', errorCode: 'EXTERNAL_DELIVERY_DISABLED', retryAfterMs: 60000 };
  // Polling a receipt never sends again. It also stops after recipient closure/device transfer.
  const active = await User.exists({ _id: delivery.userId, deletedAt: null });
  const device = await PushDevice.exists({ _id: delivery.deviceId, userId: delivery.userId, active: true });
  if (!active || !device) return { status: 'skipped', errorCode: 'RECIPIENT_UNAVAILABLE' };
  const result = await providers.push.receipt(delivery.providerMessageId, config.expo);
  if (result.status === 'accepted' && !result.receiptPending) {
    // Expo's receipt confirms provider acceptance, not display or delivery to a phone.
    await record(deliveryId, { receiptCheckedAt: new Date(), errorCode: null });
  }
  if (result.status === 'failed') {
    await record(deliveryId, { status: 'failed', errorCode: result.errorCode });
    if (result.errorCode === 'EXPO_DeviceNotRegistered') await PushDevice.updateOne({ _id: delivery.deviceId, userId: delivery.userId }, {
      $set: { active: false, disabledReason: 'DeviceNotRegistered' },
    });
  }
  return result;
}

module.exports = { deliver, checkPushReceipt };
