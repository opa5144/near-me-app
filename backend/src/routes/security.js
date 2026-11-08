const express = require('express');
const { requireAuth } = require('../middleware/requireAuth');
const security = require('../services/accountSecurity');

const router = express.Router();

// Enrollment keys, recovery codes, and replacement tokens must never be cached.
router.use((req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
router.use(requireAuth);

function handle(action, status = 200) {
  return async (req, res, next) => {
    try {
      const result = await action(req);
      if (status === 204) return res.sendStatus(204);
      return res.status(status).json(result);
    } catch (error) {
      if (!security.sendSecurityError(res, error)) next(error);
    }
  };
}

router.get('/', handle(security.getSecurityState));
router.post('/password', handle(security.changePassword));
router.post('/mfa/setup', handle(security.beginMfaSetup));
router.post('/mfa/confirm', handle(security.confirmMfaSetup));
router.post('/mfa/disable', handle(security.disableMfa));
router.post('/mfa/recovery-codes', handle(security.regenerateRecoveryCodes));
router.delete('/account', handle(security.closeAccount, 204));

module.exports = router;
