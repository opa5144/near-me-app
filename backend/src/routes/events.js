const express = require('express');
const { requireAuth } = require('../middleware/requireAuth');
const controller = require('../controllers/eventController');
const { sendEventInvite, getMyEventInvites } = require('../controllers/eventInviteController');

const router = express.Router();

router.get('/', controller.listEvents);
// Register these before /:id so "mine" and "invites" are never treated as event IDs.
router.get('/mine', requireAuth, controller.listHostedEvents);
router.get('/invites/me', requireAuth, getMyEventInvites);
router.post('/:eventId/invite', requireAuth, sendEventInvite);

router.get('/:id/image', controller.getImage);
router.get('/:id/photos/:photoId', controller.getPhoto);
router.get('/:id', controller.getEvent);
router.post('/', requireAuth, controller.createEvent);
router.patch('/:id', requireAuth, controller.updateEvent);

module.exports = router;