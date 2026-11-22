const { randomBytes, randomInt, createHmac, createCipheriv, createDecipheriv, timingSafeEqual } = require('node:crypto');
const { ServiceError } = require('./serviceError');

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function key(label) {
  const configured = process.env.TICKET_ENCRYPTION_KEY?.trim();
  if (!configured || !/^[a-f0-9]{64}$/i.test(configured)) {
    throw new ServiceError(503, 'Ticket check-in is temporarily unavailable. Please try again later.');
  }
  // Domain separation avoids using identical key material for encryption and lookups.
  return createHmac('sha256', Buffer.from(configured, 'hex')).update('nearme-ticket-v1:' + label).digest();
}

function requireTicketConfiguration() { key('encryption'); }
function lookup(kind, value) { return createHmac('sha256', key('lookup')).update(kind + ':' + value).digest('hex'); }
function tokenHash(ticketId, token) { return lookup('qr', String(ticketId) + ':' + token); }
function codeLookup(eventId, code) { return lookup('code', String(eventId) + ':' + code); }
function randomToken() { return randomBytes(32).toString('base64url'); }
function randomCode() { return Array.from({ length: 5 }, () => ALPHABET[randomInt(ALPHABET.length)]).join(''); }

function encrypt(value, ticketId, kind) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key('encryption'), iv);
  cipher.setAAD(Buffer.from(String(ticketId) + ':' + kind));
  const data = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), data.toString('base64url')].join('.');
}

function decrypt(value, ticketId, kind) {
  const encryptionKey = key('encryption');
  try {
    const parts = typeof value === 'string' ? value.split('.') : [];
    if (parts.length !== 4 || parts[0] !== 'v1') throw new Error('Invalid encrypted ticket.');
    const decipher = createDecipheriv('aes-256-gcm', encryptionKey, Buffer.from(parts[1], 'base64url'));
    decipher.setAAD(Buffer.from(String(ticketId) + ':' + kind));
    decipher.setAuthTag(Buffer.from(parts[2], 'base64url'));
    return Buffer.concat([decipher.update(Buffer.from(parts[3], 'base64url')), decipher.final()]).toString('utf8');
  } catch {
    throw new ServiceError(503, 'This ticket is temporarily unavailable. Please try again later.');
  }
}

function qrPayload(ticketId, token) { return 'nearme-ticket:v1:' + String(ticketId) + ':' + token; }
function parseQrPayload(value) {
  const match = typeof value === 'string' && /^nearme-ticket:v1:([a-f0-9]{24}):([A-Za-z0-9_-]{43})$/i.exec(value);
  return match ? { ticketId: match[1].toLowerCase(), token: match[2] } : null;
}
function equalHash(left, right) {
  return typeof left === 'string' && typeof right === 'string' && /^[a-f0-9]{64}$/i.test(left) && /^[a-f0-9]{64}$/i.test(right) &&
    timingSafeEqual(Buffer.from(left, 'hex'), Buffer.from(right, 'hex'));
}

module.exports = { requireTicketConfiguration, tokenHash, codeLookup, randomToken, randomCode, encrypt, decrypt, qrPayload, parseQrPayload, equalHash };
