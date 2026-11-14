const express = require('express');
const { requireAuth } = require('../middleware/requireAuth');
const { noStore } = require('../middleware/noStore');
const notificationController = require('../controllers/notificationController');

const router = express.Router();
router.use(requireAuth, noStore);
router.get('/', notificationController.listInbox);
router.get('/unread-count', notificationController.getUnreadCount);
router.get('/preferences', notificationController.getPreferences);
router.patch('/preferences', notificationController.updatePreferences);
router.post('/read-all', notificationController.readAll);
router.patch('/:id/read', notificationController.setRead);
module.exports = router;
