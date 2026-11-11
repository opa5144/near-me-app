const express = require('express');
const { requireAuth } = require('../middleware/requireAuth');
const controller = require('../controllers/eventController');

const router = express.Router();

router.get('/', controller.listEvents);
// Register this before /:id so "mine" is never treated as an event ID.
router.get('/mine', requireAuth, controller.listHostedEvents);
router.get('/:id/image', controller.getImage);
router.get('/:id', controller.getEvent);
router.post('/', requireAuth, controller.createEvent);
router.patch('/:id', requireAuth, controller.updateEvent);

module.exports = router;
