const { randomUUID } = require('node:crypto');
const { getNotificationConfig } = require('../config/notifications');
const { processDueJobs, reconcileScheduledJobs } = require('../services/notifications/jobService');

// Create collections/indexes before a transaction can write to them. Importing
// this module alone does not connect to Atlas, create records, or start timers.
async function initializeNotificationModels() {
  const models = [
    require('../models/Notification'), require('../models/NotificationJob'),
    require('../models/NotificationDelivery'), require('../models/PushDevice'),
    require('../models/OrganizerFollow'), require('../models/NotificationSettings'),
    require('../models/EventSelection'), require('../models/EventRating'), require('../models/EventInvite'),
    require('../models/Friendship'),
  ];
  await Promise.all(models.map(model => model.init()));
}

function startNotificationWorker() {
  const config = getNotificationConfig();
  if (!config.workerEnabled) return { stop: async () => {} };
  const workerId = randomUUID();
  let stopping = false;
  let timer = null;
  let inFlight = null;
  const shouldStop = () => stopping;

  async function tick() {
    try {
      // Reconciliation only creates future schedules. Missed reminders expire;
      // it never invents confirmations for pre-existing registrations.
      await reconcileScheduledJobs({ shouldStop });
    } catch (error) {
      console.error('Notification schedule reconciliation failed:', error.name);
    }
    if (stopping) return;
    try {
      await processDueJobs({ workerId, limit: config.batchSize, shouldStop });
    } catch (error) {
      // Log no message/payload/contact/token/provider response.
      console.error('Notification worker failed:', error.name);
    }
  }

  function schedule(delay) {
    timer = setTimeout(() => {
      timer = null;
      inFlight = tick().finally(() => {
        inFlight = null;
        if (!stopping) schedule(config.pollMs);
      });
    }, delay);
    timer.unref();
  }

  schedule(0);
  return {
    async stop() {
      stopping = true;
      if (timer) clearTimeout(timer);
      timer = null;
      if (inFlight) await inFlight;
    },
  };
}

module.exports = { initializeNotificationModels, startNotificationWorker };
