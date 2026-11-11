const express = require('express');
const { requireAuth } = require('../middleware/requireAuth');
const { noStore } = require('../middleware/noStore');
const controller = require('../controllers/eventSelectionController');

const router = express.Router();

router.use(noStore);
router.use(requireAuth);
router.get('/', controller.listSelections);
router.get('/history', controller.getHistory);
router.get('/history/:id', controller.getBooking);
router.put('/:eventId', controller.updateSelection);

module.exports = router;
