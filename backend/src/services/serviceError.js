// Business failures carry plain metadata; controllers decide how to send them over HTTP.
class ServiceError extends Error {
  constructor(status, message, details = {}) {
    super(message);
    this.name = 'ServiceError';
    this.status = status;
    Object.assign(this, details);
  }
}

module.exports = { ServiceError };
