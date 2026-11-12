const mongoose = require('mongoose');
const User = require('../models/User');
const AccountSecurity = require('../models/AccountSecurity');
const { authVersionFilter } = require('./accountState');
const { ServiceError } = require('./serviceError');

class ActiveAccountWriteError extends ServiceError {
  constructor(status, message) {
    super(status, message);
    this.name = 'ActiveAccountWriteError';
  }
}

// Lock the participating account records before changing their events or relationships.
// Closure writes the same account document, so it must finish before this transaction
// (which then rejects the closed account), or wait until these writes have committed.
async function withActiveAccountWrite(auth, counterpartIds, write) {
  const currentId = String(auth.userId).toLowerCase();
  const accountIds = [...new Set([currentId, ...counterpartIds.map(id => String(id).toLowerCase())])].sort();

  return mongoose.connection.transaction(async session => {
    // Stable ordering avoids two relationship updates locking users in opposite orders.
    for (const accountId of accountIds) {
      const currentAccount = accountId === currentId;
      const result = await User.updateOne({
        _id: accountId,
        deletedAt: null,
      }, { $inc: { archiveWriteVersion: 1 } }, {
        session,
        timestamps: false,
      });

      if (!result.matchedCount) {
        throw new ActiveAccountWriteError(currentAccount ? 401 : 404,
          currentAccount ? 'Please log in again.' : 'This account is unavailable.');
      }
    }

    // Security changes use this same User fence; check the authoritative version after locking it.
    if (!(await AccountSecurity.exists({
      userId: auth.userId, ...authVersionFilter(auth.authVersion ?? 0),
    }).session(session))) {
      throw new ActiveAccountWriteError(401, 'Please log in again.');
    }

    // No HTTP responses or other external effects belong here: MongoDB may retry it.
    return write(session);
  });
}

module.exports = { withActiveAccountWrite, ActiveAccountWriteError };
