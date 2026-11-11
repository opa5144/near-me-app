const express = require('express');
const { requireAuth } = require('../middleware/requireAuth');
const friendController = require('../controllers/friendController');

const router = express.Router();
router.use(requireAuth);

router.get('/', friendController.getNetwork);
router.post('/request', friendController.sendRequest);
router.patch('/request/:requestId', friendController.respondToRequest);

module.exports = router;
