const User = require('../models/User');
const AccountSecurity = require('../models/AccountSecurity');

// Older copied security records without a version are equivalent to version zero.
function authVersionFilter(version = 0) {
  return version === 0
    ? { $or: [{ authVersion: 0 }, { authVersion: { $exists: false } }] }
    : { authVersion: version };
}

async function accountVersionMatches(userId, version, { session } = {}) {
  const identity = User.exists({ _id: userId, deletedAt: null });
  if (session) identity.session(session);
  if (!(await identity)) return false;
  const security = AccountSecurity.exists({ userId, ...authVersionFilter(version) });
  if (session) security.session(session);
  return Boolean(await security);
}

module.exports = { authVersionFilter, accountVersionMatches };
