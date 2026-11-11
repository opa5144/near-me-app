const express = require('express');
const { requireAuth } = require('../middleware/requireAuth');
const { noStore } = require('../middleware/noStore');
const settingsController = require('../controllers/settingsController');

const router = express.Router();
router.use(requireAuth);
router.use(noStore);

router.get('/cities', settingsController.getCitySuggestions);
router.get('/preferences', settingsController.getPreferences);
router.patch('/preferences', settingsController.updatePreferences);
router.get('/notifications', settingsController.getNotifications);
router.patch('/notifications', settingsController.updateNotifications);

module.exports = router;
