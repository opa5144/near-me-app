const express = require('express');
const { requireAuth } = require('../middleware/requireAuth');
const { noStore } = require('../middleware/noStore');
const controller = require('../controllers/authController');
const securityRoutes = require('./security');

const router = express.Router();

router.use(noStore);
router.use('/security', securityRoutes);
router.get('/username-availability', controller.getUsernameAvailability);
router.post('/signup', controller.signup);
router.post('/login', controller.login);
router.post('/login/mfa', controller.loginMfa);
router.get('/me', requireAuth, controller.getProfile);
router.patch('/me', requireAuth, controller.updateProfile);
router.post('/logout', requireAuth, controller.logout);

module.exports = router;
