const express = require('express');
const { requireAuth } = require('../middleware/requireAuth');
const userController = require('../controllers/userController');

const router = express.Router();

router.put('/profile', requireAuth, userController.updateProfile);
router.get('/:id/avatar', userController.getAvatar);
router.get('/me', requireAuth, userController.getCurrentUser);

module.exports = router;
