const security = require('../services/accountSecurity');
const { getAuthContext, sendServiceError } = require('./controllerUtils');

// Services receive values and return results; this adapter owns all HTTP effects.
function handle(action, status = 200) {
  return async (req, res, next) => {
    try {
      const result = await action(getAuthContext(req), req.body);
      if (status === 204) return res.sendStatus(204);
      return res.status(status).json(result);
    } catch (error) {
      if (!sendServiceError(res, error)) next(error);
    }
  };
}

module.exports = {
  getSecurityState: handle(security.getSecurityState),
  changePassword: handle(security.changePassword),
  beginMfaSetup: handle(security.beginMfaSetup),
  confirmMfaSetup: handle(security.confirmMfaSetup),
  disableMfa: handle(security.disableMfa),
  regenerateRecoveryCodes: handle(security.regenerateRecoveryCodes),
  closeAccount: handle(security.closeAccount, 204),
};
