const auth = require('../services/authService');
const { getAuthContext, sendServiceError } = require('./controllerUtils');

// Controller adapters own status codes, response serialization, and HTTP error handling.
function handle(action, { status = 200, fallbackMessage, logPrefix, login = false }) {
  return async (req, res) => {
    try {
      const result = await action(req);
      if (status === 204) return res.sendStatus(204);
      return res.status(status).json(result);
    } catch (error) {
      if (login && error.name === 'SessionStateError') {
        return res.status(401).json({ message: 'Please sign in again.' });
      }
      if (sendServiceError(res, error)) return;
      if (logPrefix) console.error(logPrefix, error.name);
      return res.status(500).json({ message: fallbackMessage });
    }
  };
}

module.exports = {
  getUsernameAvailability: handle(req => auth.getUsernameAvailability(req.query.username), {
    fallbackMessage: 'Unable to check this username. Please try again.',
  }),
  signup: handle(req => auth.signup(req.body), {
    status: 201, fallbackMessage: 'Unable to create your account. Please try again.', logPrefix: 'Signup failed:',
  }),
  login: handle(req => auth.login(req.body), {
    login: true, fallbackMessage: 'Unable to log in. Please try again.', logPrefix: 'Login failed:',
  }),
  loginMfa: handle(req => auth.loginMfa(req.body), {
    login: true, fallbackMessage: 'Unable to finish signing in. Please try again.', logPrefix: 'MFA login failed:',
  }),
  getProfile: handle(req => auth.getProfile(getAuthContext(req)), {
    fallbackMessage: 'Unable to load your account.',
  }),
  updateProfile: handle(req => auth.updateProfile(getAuthContext(req), req.body), {
    fallbackMessage: 'Unable to save your account. Please try again.', logPrefix: 'Account update failed:',
  }),
  logout: handle(req => auth.logout(getAuthContext(req)), {
    status: 204, fallbackMessage: 'Unable to log out. Please try again.',
  }),
};
