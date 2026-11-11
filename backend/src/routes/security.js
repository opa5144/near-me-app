const express = require('express');
const { requireAuth } = require('../middleware/requireAuth');
const { noStore } = require('../middleware/noStore');
const controller = require('../controllers/securityController');

const router = express.Router();

// Enrollment keys, recovery codes, and replacement tokens must never be cached.
router.use(noStore);
router.use(requireAuth);

router.get('/', controller.getSecurityState);
router.post('/password', controller.changePassword);
router.post('/mfa/setup', controller.beginMfaSetup);
router.post('/mfa/confirm', controller.confirmMfaSetup);
router.post('/mfa/disable', controller.disableMfa);
router.post('/mfa/recovery-codes', controller.regenerateRecoveryCodes);
router.delete('/account', controller.closeAccount);

module.exports = router;
