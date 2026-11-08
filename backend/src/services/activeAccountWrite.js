const mongoose = require('mongoose');
const User = require('../models/User');
const { authVersionFilter } = require('../middleware/requireAuth');

class ActiveAccountWriteError extends Error {
  constructor(status, message) {
    super(message);
    this.name = 'ActiveAccountWriteError';
    this.status = status;
  }
}

// Lock the participating account records before changing their events or relationships.
// Closure writes the same account document, so it must finish before this transaction
// (which then rejects the closed account), or wait until these writes have committed.
async function withActiveAccountWrite(req, counterpartIds, write) {
  const currentId = String(req.userId).toLowerCase();
  const accountIds = [...new Set([currentId, ...counterpartIds.map(id => String(id).toLowerCase())])].sort();

  return mongoose.connection.transaction(async session => {
    // Stable ordering avoids two relationship updates locking users in opposite orders.
    for (const accountId of accountIds) {
      const currentAccount = accountId === currentId;
      const result = await User.updateOne({
        _id: accountId,
        deletedAt: null,
        ...(currentAccount ? authVersionFilter(req.authVersion ?? 0) : {}),
      }, { $inc: { archiveWriteVersion: 1 } }, {
        session,
        timestamps: false,
      });

      if (!result.matchedCount) {
        throw new ActiveAccountWriteError(currentAccount ? 401 : 404,
          currentAccount ? 'Please log in again.' : 'This account is unavailable.');
      }
    }

    // No HTTP responses or other external effects belong here: MongoDB may retry it.
    return write(session);
  });
}

module.exports = { withActiveAccountWrite, ActiveAccountWriteError };
