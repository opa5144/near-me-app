const express = require('express');
const { requireAuth } = require('../middleware/requireAuth');
const controller = require('../controllers/eventController');
const ratings = require('../controllers/eventRatingController');

const router = express.Router();

router.get('/', controller.listEvents);
// Register this before /:id so "mine" is never treated as an event ID.
router.get('/mine', requireAuth, controller.listHostedEvents);
router.get('/:id/image', controller.getImage);
router.get('/:id/photos/:photoId', controller.getPhoto);
router.get('/:id/rating', requireAuth, ratings.getRating);
router.put('/:id/rating', requireAuth, ratings.putRating);
router.get('/:id/ratings/summary', requireAuth, ratings.getSummary);
router.get('/:id', controller.getEvent);
router.post('/', requireAuth, controller.createEvent);
router.patch('/:id', requireAuth, controller.updateEvent);
router.post('/:id/cancel', requireAuth, controller.cancelEvent);

module.exports = router;
