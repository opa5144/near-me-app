const express = require('express');
const { requireAuth } = require('../middleware/requireAuth');
const { optionalAuth } = require('../middleware/optionalAuth');
const controller = require('../controllers/eventController');
const ratings = require('../controllers/eventRatingController');
const invites = require('../controllers/eventInviteController');

const router = express.Router();

router.get('/', optionalAuth, controller.listEvents);
// Register these before /:id so "mine" and "invites" are never treated as event IDs.
router.get('/mine', requireAuth, controller.listHostedEvents);
router.get('/invites/me', requireAuth, invites.getMyEventInvites);
router.get('/invites/:inviteId', requireAuth, invites.getEventInvite);
router.patch('/invites/:inviteId', requireAuth, invites.updateEventInvite);
router.post('/:eventId/invite', requireAuth, invites.sendEventInvite);

router.get('/:id/image', optionalAuth, controller.getImage);
router.get('/:id/photos/:photoId', optionalAuth, controller.getPhoto);
router.get('/:id/rating', requireAuth, ratings.getRating);
router.put('/:id/rating', requireAuth, ratings.putRating);
router.get('/:id/ratings/summary', requireAuth, ratings.getSummary);
router.get('/:id', optionalAuth, controller.getEvent);
router.post('/', requireAuth, controller.createEvent);
router.post('/drafts', requireAuth, controller.createDraft);
router.patch('/:id', requireAuth, controller.updateEvent);
router.post('/:id/cancel', requireAuth, controller.cancelEvent);
router.patch('/:id/draft', requireAuth, controller.updateDraft);
router.post('/:id/publish', requireAuth, controller.publishDraft);
router.post('/:id/archive', requireAuth, controller.archiveEvent);
router.post('/:id/reschedule', requireAuth, controller.rescheduleEvent);

module.exports = router;
