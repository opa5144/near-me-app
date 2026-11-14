const { createHash } = require('node:crypto');

// Occurrence/version parts allow real repeated actions without duplicating retries.
function notificationKey(...parts) {
  return createHash('sha256').update(JSON.stringify(parts.map(part => part == null ? null : String(part)))).digest('hex');
}
module.exports = { notificationKey };
