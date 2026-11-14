const express = require('express');
const { requireAuth } = require('../middleware/requireAuth');
const { noStore } = require('../middleware/noStore');
const organizerFollowController = require('../controllers/organizerFollowController');

const router = express.Router();
router.use(requireAuth, noStore);
router.get('/', organizerFollowController.listFollows);
router.post('/:organizerId', organizerFollowController.followOrganizer);
router.delete('/:organizerId', organizerFollowController.unfollowOrganizer);
module.exports = router;
