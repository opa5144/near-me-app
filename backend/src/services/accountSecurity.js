const {
  randomBytes, createHash, createCipheriv, createDecipheriv,
} = require('node:crypto');
const argon2 = require('argon2');
const OTPAuth = require('otpauth');
const QRCode = require('qrcode');
const User = require('../models/User');
const AccountSecurity = require('../models/AccountSecurity');
const AuthSession = require('../models/AuthSession');
const AuthChallenge = require('../models/AuthChallenge');
const { createSession, SessionStateError } = require('./sessionService');
const { authVersionFilter } = require('./accountState');
const { withActiveAccountWrite } = require('./activeAccountWrite');
const { readUserProfile } = require('./accountReadService');
const { ServiceError } = require('./serviceError');

const MAX_FAILURES = 5;
const COOLDOWN_MS = 5 * 60 * 1000;
const LOGIN_CHALLENGE_MS = 5 * 60 * 1000;
const SETUP_CHALLENGE_MS = 10 * 60 * 1000;
const SECURITY_FIELDS = [
  '_id userId',
  '+passwordHash +authVersion +mfaEnabled +mfaSecretEncrypted +mfaRecoveryCodeHashes',
  '+mfaLastUsedStep +mfaFailedAttempts +mfaLockedUntil',
  '+securityPasswordFailedAttempts +securityPasswordLockedUntil',
].join(' ');

class SecurityError extends ServiceError {
  constructor(status, message, errors = {}, extras = {}) {
    super(status, message, { errors, ...extras });
    this.name = 'SecurityError';
  }
}

function versionOf(user) { return user.authVersion ?? 0; }

function securityQuery(user, conditions = []) {
  return {
    userId: user._id,
    $and: [authVersionFilter(versionOf(user)), ...conditions],
  };
}

function unlocked(field, now = new Date()) {
  return { $or: [{ [field]: null }, { [field]: { $lte: now } }] };
}

function withSecurity(user, security) {
  const values = typeof security.toObject === 'function' ? security.toObject() : security;
  // A security row has its own _id; every cryptographic/challenge identity remains the original User ID.
  return { ...user, ...values, _id: user._id, userId: user._id };
}

async function loadAccount(userId, authVersion, { session } = {}) {
  const identityQuery = User.findOne({ _id: userId, deletedAt: null })
    .select('_id firstName lastName username email deletedAt');
  if (session) identityQuery.session(session);
  const identity = await identityQuery.lean();
  if (!identity) throw new SecurityError(403, 'Your account security changed. Please sign in again.');
  const security = AccountSecurity.findOne({ userId, ...authVersionFilter(authVersion) }).select(SECURITY_FIELDS);
  if (session) security.session(session);
  const state = await security.lean();
  if (!state) throw new SecurityError(403, 'Your account security changed. Please sign in again.');
  return withSecurity(identity, state);
}

function securityBody(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new SecurityError(400, 'Please submit your security details.');
  }
  return body;
}

async function publicUser(user, baseUrl) {
  const profile = await readUserProfile(user._id, baseUrl);
  if (!profile) throw new SessionStateError();
  return {
    _id: user._id, firstName: profile.firstName, lastName: profile.lastName,
    username: profile.username, email: profile.email, avatarUrl: profile.avatarUrl ?? '',
  };
}

function throwIfLocked(user, kind) {
  const field = kind === 'mfa' ? 'mfaLockedUntil' : 'securityPasswordLockedUntil';
  const until = user[field] ? new Date(user[field]) : null;
  if (until && until.getTime() > Date.now()) {
    throw new SecurityError(429, 'Too many verification attempts. Please try again after the cooldown.', {}, {
      retryAfterSeconds: Math.max(1, Math.ceil((until.getTime() - Date.now()) / 1000)),
      lockedUntil: until.toISOString(),
    });
  }
}

async function rejectProof(user, field, message, kind = 'mfa') {
  const counter = kind === 'mfa' ? 'mfaFailedAttempts' : 'securityPasswordFailedAttempts';
  const lock = kind === 'mfa' ? 'mfaLockedUntil' : 'securityPasswordLockedUntil';
  const now = new Date();
  const expiredLock = {
    $and: [{ $ne: [{ $ifNull: ['$' + lock, null] }, null] }, { $lte: ['$' + lock, now] }],
  };
  const nextCount = {
    $cond: [expiredLock, 1, { $add: [{ $ifNull: ['$' + counter, 0] }, 1] }],
  };
  const reachesLimit = { $gte: [nextCount, MAX_FAILURES] };
  // Commit the fenced counter update before throwing; throwing in the callback would roll it back.
  const updated = await withActiveAccountWrite({ userId: user._id, authVersion: versionOf(user) }, [],
    async session => AccountSecurity.findOneAndUpdate(securityQuery(user, [unlocked(lock, now)]), [{
      $set: {
        [counter]: { $cond: [reachesLimit, 0, nextCount] },
        [lock]: { $cond: [reachesLimit, new Date(now.getTime() + COOLDOWN_MS), null] },
      },
    }], { new: true, updatePipeline: true, session }).select(SECURITY_FIELDS));
  if (!updated) {
    const current = await loadAccount(user._id, versionOf(user));
    throwIfLocked(current, kind);
    throw new SecurityError(403, 'Your account security changed. Please sign in again.');
  }
  throwIfLocked(updated, kind);
  throw new SecurityError(400, 'Please correct the highlighted field.', { [field]: message });
}

async function verifyCurrentPassword(user, currentPassword) {
  throwIfLocked(user, 'password');
  if (typeof currentPassword !== 'string' || !currentPassword) {
    throw new SecurityError(400, 'Enter your current password.', { currentPassword: 'Current password is required.' });
  }
  if (Array.from(currentPassword).length > 128 || !(await argon2.verify(user.passwordHash, currentPassword))) {
    return rejectProof(user, 'currentPassword', 'Current password is incorrect.', 'password');
  }
  const updated = await withActiveAccountWrite({ userId: user._id, authVersion: versionOf(user) }, [],
    async session => AccountSecurity.findOneAndUpdate(securityQuery(user, [
      unlocked('securityPasswordLockedUntil'),
    ]), { $set: { securityPasswordFailedAttempts: 0, securityPasswordLockedUntil: null } }, {
      new: true, session,
    }).select(SECURITY_FIELDS));
  if (!updated) {
    const current = await loadAccount(user._id, versionOf(user));
    throwIfLocked(current, 'password');
    throw new SecurityError(403, 'Your account security changed. Please sign in again.');
  }
  return withSecurity(user, updated);
}

function encryptionKey() {
  const value = process.env.MFA_ENCRYPTION_KEY?.trim();
  const key = value ? Buffer.from(value, 'base64') : null;
  if (!key || key.length !== 32 || key.toString('base64') !== value) {
    throw new SecurityError(503, 'Authenticator security is unavailable. Please contact support.');
  }
  return key;
}

function encryptSecret(secret, userId) {
  const nonce = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), nonce);
  cipher.setAAD(Buffer.from('NearMe MFA v1:' + String(userId)));
  const encrypted = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  return ['v1', nonce.toString('base64'), cipher.getAuthTag().toString('base64'), encrypted.toString('base64')].join(':');
}

function decryptSecret(encrypted, userId) {
  const key = encryptionKey();
  try {
    const [format, nonce, tag, data, extra] = (encrypted || '').split(':');
    if (format !== 'v1' || !nonce || !tag || !data || extra !== undefined) throw new Error('Invalid encrypted seed');
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(nonce, 'base64'));
    decipher.setAAD(Buffer.from('NearMe MFA v1:' + String(userId)));
    decipher.setAuthTag(Buffer.from(tag, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(data, 'base64')), decipher.final()]).toString('utf8');
  } catch {
    throw new SecurityError(503, 'Authenticator verification is unavailable. Please contact support.');
  }
}

function authenticator(secret, user) {
  return new OTPAuth.TOTP({
    issuer: 'NearMe', label: user.email, algorithm: 'SHA1', digits: 6, period: 30,
    secret: OTPAuth.Secret.fromBase32(secret),
  });
}

function matchingStep(secret, user, code) {
  if (typeof code !== 'string' || !/^\d{6}$/.test(code.trim())) return null;
  const totp = authenticator(secret, user);
  const timestamp = Date.now();
  const delta = totp.validate({ token: code.trim(), timestamp, window: 1 });
  return Number.isInteger(delta) ? totp.counter({ timestamp }) + delta : null;
}

function normalizeRecoveryCode(value) {
  return typeof value === 'string' ? value.replace(/[\s-]/g, '').toUpperCase() : '';
}

function recoveryHash(value) {
  return createHash('sha256').update('NearMe recovery:' + value).digest('hex');
}

function newRecoveryCodes() {
  const recoveryCodes = Array.from({ length: 10 }, () => {
    const value = randomBytes(10).toString('hex').toUpperCase();
    return value.match(/.{5}/g).join('-');
  });
  return {
    recoveryCodes,
    hashes: recoveryCodes.map(value => recoveryHash(normalizeRecoveryCode(value))),
  };
}

async function verifyMfaProof(user, body) {
  if (!user.mfaEnabled) return user;
  throwIfLocked(user, 'mfa');
  const code = typeof body.code === 'string' ? body.code.trim() : body.code;
  const recoveryCode = normalizeRecoveryCode(body.recoveryCode);
  const hasCode = typeof body.code === 'string' ? Boolean(body.code.trim()) : body.code != null;
  const hasRecovery = typeof body.recoveryCode === 'string'
    ? Boolean(body.recoveryCode.trim()) : body.recoveryCode != null;
  if (hasCode && hasRecovery) {
    throw new SecurityError(400, 'Use an authenticator code or a recovery code, not both.', {
      code: 'Choose one verification method.', recoveryCode: 'Choose one verification method.',
    });
  }
  if (!hasCode && !hasRecovery) {
    throw new SecurityError(400, 'Authenticator verification is required.', { code: 'Enter an authenticator or recovery code.' });
  }
  const conditions = [unlocked('mfaLockedUntil'), { mfaEnabled: true }];
  let update;
  let field;
  if (hasRecovery) {
    field = 'recoveryCode';
    if (!/^[A-F0-9]{20}$/.test(recoveryCode)) {
      return rejectProof(user, field, 'Recovery code is invalid or has already been used.');
    }
    const hash = recoveryHash(recoveryCode);
    conditions.push({ mfaRecoveryCodeHashes: hash });
    update = {
      $pull: { mfaRecoveryCodeHashes: hash },
      $set: { mfaFailedAttempts: 0, mfaLockedUntil: null },
    };
  } else {
    field = 'code';
    const step = matchingStep(decryptSecret(user.mfaSecretEncrypted, user._id), user, code);
    if (step === null) return rejectProof(user, field, 'Authenticator code is incorrect or expired.');
    conditions.push({ $or: [
      { mfaLastUsedStep: { $lt: step } }, { mfaLastUsedStep: null },
    ] });
    update = { $set: { mfaLastUsedStep: step, mfaFailedAttempts: 0, mfaLockedUntil: null } };
  }
  // Conditional updates make each OTP step and each recovery hash usable only once, even concurrently.
  const updated = await withActiveAccountWrite({ userId: user._id, authVersion: versionOf(user) }, [],
    async session => AccountSecurity.findOneAndUpdate(securityQuery(user, conditions), update, { new: true, session })
      .select(SECURITY_FIELDS));
  if (!updated) {
    return rejectProof(user, field, field === 'code'
      ? 'Authenticator code is incorrect, expired, or already used.'
      : 'Recovery code is invalid or has already been used.');
  }
  return withSecurity(user, updated);
}

async function sensitiveProof(auth, body) {
  const user = await loadAccount(auth.userId, auth.authVersion ?? 0);
  const verified = await verifyCurrentPassword(user, body.currentPassword);
  return verifyMfaProof(verified, body);
}

function challengeHash(value) { return createHash('sha256').update('NearMe challenge:' + value).digest('hex'); }

async function createChallenge(user, purpose, duration, extra = {}) {
  const token = randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + duration);
  await AuthChallenge.init();
  await withActiveAccountWrite({ userId: user._id, authVersion: versionOf(user) }, [],
    async session => AuthChallenge.create([{
      userId: user._id, authVersion: versionOf(user), purpose,
      tokenHash: challengeHash(token), expiresAt, ...extra,
    }], { session }));
  return { token, expiresAt: expiresAt.toISOString() };
}

async function readChallenge(token, purpose, extra = {}) {
  if (typeof token !== 'string' || !/^[a-f0-9]{64}$/i.test(token)) {
    throw new SecurityError(410, 'This verification request is invalid or expired. Start again.');
  }
  const challenge = await AuthChallenge.findOne({
    tokenHash: challengeHash(token), purpose, expiresAt: { $gt: new Date() }, ...extra,
  }).select('+secretEncrypted');
  if (!challenge) throw new SecurityError(410, 'This verification request is invalid or expired. Start again.');
  return challenge;
}

async function consumeChallenge(challenge) {
  const consumed = await AuthChallenge.findOneAndDelete({ _id: challenge._id, expiresAt: { $gt: new Date() } });
  if (!consumed) throw new SecurityError(410, 'This verification request has expired or has already been used. Start again.');
}

async function cleanupAuthentication(userId, version, all = false) {
  // Version checks provide immediate revocation; cleanup is best effort if a later DB request fails.
  const older = { $or: [{ authVersion: { $lt: version } }, { authVersion: { $exists: false } }] };
  const results = await Promise.allSettled([
    AuthSession.deleteMany({ userId, ...(all ? {} : older) }),
    AuthChallenge.deleteMany({ userId, ...(all ? {} : older) }),
  ]);
  for (const result of results) {
    if (result.status === 'rejected') console.error('Revoked authentication cleanup failed:', result.reason?.name);
  }
}

async function rotateAccount(user, changes, unset = {}, conditions = []) {
  const state = await withActiveAccountWrite({ userId: user._id, authVersion: versionOf(user) }, [],
    async session => AccountSecurity.findOneAndUpdate(securityQuery(user, conditions), {
      $set: changes, $inc: { authVersion: 1 },
      ...(Object.keys(unset).length ? { $unset: unset } : {}),
    }, { new: true, runValidators: true, session }).select(SECURITY_FIELDS));
  if (!state) {
    const current = await loadAccount(user._id, versionOf(user));
    throwIfLocked(current, 'mfa');
    throw new SecurityError(403, 'Your account security changed. Please sign in again.');
  }
  const updated = withSecurity(user, state);
  await cleanupAuthentication(updated._id, versionOf(updated));
  const session = await createSession(updated._id, versionOf(updated));
  return { user: updated, session };
}

async function getSecurityState(auth) {
  const user = await loadAccount(auth.userId, auth.authVersion ?? 0);
  return {
    mfaEnabled: Boolean(user.mfaEnabled),
    recoveryCodesRemaining: user.mfaRecoveryCodeHashes?.length ?? 0,
    mfaLockedUntil: user.mfaLockedUntil && new Date(user.mfaLockedUntil).getTime() > Date.now()
      ? new Date(user.mfaLockedUntil).toISOString() : null,
  };
}

async function changePassword(auth, input) {
  const body = securityBody(input);
  const errors = {};
  if (typeof body.currentPassword !== 'string' || !body.currentPassword) errors.currentPassword = 'Current password is required.';
  if (typeof body.newPassword !== 'string' || Array.from(body.newPassword).length < 15 || Array.from(body.newPassword).length > 128) {
    errors.newPassword = 'Password must contain 15 to 128 characters.';
  }
  if (typeof body.confirmPassword !== 'string' || !body.confirmPassword) {
    errors.confirmPassword = 'Confirm your new password.';
  } else if (body.newPassword !== body.confirmPassword) {
    errors.confirmPassword = 'New passwords do not match.';
  }
  if (Object.keys(errors).length) throw new SecurityError(400, 'Please correct the highlighted fields.', errors);
  const user = await sensitiveProof(auth, body);
  const passwordHash = await argon2.hash(body.newPassword, { type: argon2.argon2id });
  const { session } = await rotateAccount(user, { passwordHash });
  return { message: 'Password updated. Other sessions have been signed out.', ...session };
}

async function beginMfaSetup(auth, input) {
  const user = await sensitiveProof(auth, securityBody(input));
  throwIfLocked(user, 'mfa');
  const secret = OTPAuth.Secret.fromHex(randomBytes(20).toString('hex')).base32;
  const secretEncrypted = encryptSecret(secret, user._id);
  const qrCodeDataUrl = await QRCode.toDataURL(authenticator(secret, user).toString(), {
    errorCorrectionLevel: 'M', width: 256, margin: 2,
  });
  const challenge = await createChallenge(user, 'mfa-setup', SETUP_CHALLENGE_MS, {
    authSessionId: auth.sessionId, secretEncrypted,
  });
  return { setupToken: challenge.token, secret, qrCodeDataUrl, expiresAt: challenge.expiresAt };
}

async function confirmMfaSetup(auth, input) {
  const body = securityBody(input);
  const user = await loadAccount(auth.userId, auth.authVersion ?? 0);
  throwIfLocked(user, 'mfa');
  const challenge = await readChallenge(body.setupToken, 'mfa-setup', {
    userId: auth.userId, authSessionId: auth.sessionId, authVersion: versionOf(user),
  });
  const secret = decryptSecret(challenge.secretEncrypted, user._id);
  const step = matchingStep(secret, user, body.code);
  if (step === null) return rejectProof(user, 'code', 'Authenticator code is incorrect or expired.');
  await consumeChallenge(challenge);
  const recovery = newRecoveryCodes();
  const { session } = await rotateAccount(user, {
    mfaEnabled: true, mfaSecretEncrypted: challenge.secretEncrypted,
    mfaRecoveryCodeHashes: recovery.hashes, mfaLastUsedStep: step,
    mfaFailedAttempts: 0, mfaLockedUntil: null,
  }, {}, [unlocked('mfaLockedUntil')]);
  return {
    message: 'Authenticator enabled. Save your recovery codes now.', mfaEnabled: true,
    recoveryCodes: recovery.recoveryCodes, ...session,
  };
}

async function disableMfa(auth, input) {
  const user = await sensitiveProof(auth, securityBody(input));
  if (!user.mfaEnabled) throw new SecurityError(400, 'Authenticator verification is already disabled.');
  const { session } = await rotateAccount(user, {
    mfaEnabled: false, mfaRecoveryCodeHashes: [], mfaLastUsedStep: -1,
    mfaFailedAttempts: 0, mfaLockedUntil: null,
  }, { mfaSecretEncrypted: '' });
  return { message: 'Authenticator disabled. Other sessions have been signed out.', mfaEnabled: false, ...session };
}

async function regenerateRecoveryCodes(auth, input) {
  const user = await sensitiveProof(auth, securityBody(input));
  if (!user.mfaEnabled) throw new SecurityError(400, 'Enable an authenticator before generating recovery codes.');
  const recovery = newRecoveryCodes();
  const { session } = await rotateAccount(user, { mfaRecoveryCodeHashes: recovery.hashes });
  return { message: 'New recovery codes generated. Previous codes no longer work.', recoveryCodes: recovery.recoveryCodes, ...session };
}

async function closeAccount(auth, input) {
  const body = securityBody(input);
  if (body.confirmation !== 'DELETE') {
    throw new SecurityError(400, 'Confirm permanent account closure.', { confirmation: 'Type DELETE to permanently close your account.' });
  }
  const user = await sensitiveProof(auth, body);
  const closed = await withActiveAccountWrite({ userId: user._id, authVersion: versionOf(user) }, [], async session => {
    // Identity closure and credential revocation commit together under the same account fence.
    const state = await AccountSecurity.findOneAndUpdate(securityQuery(user), {
      $inc: { authVersion: 1 },
    }, { new: true, session }).select('+authVersion');
    if (!state) throw new SecurityError(403, 'Your account security changed. Please sign in again.');
    const identity = await User.updateOne({ _id: user._id, deletedAt: null }, {
      $set: { deletedAt: new Date() },
    }, { session });
    if (!identity.matchedCount) throw new SecurityError(403, 'Your account security changed. Please sign in again.');
    return state;
  });
  await cleanupAuthentication(user._id, versionOf(closed), true);
}

async function beginLoginMfa(user) {
  const current = await loadAccount(user._id, versionOf(user));
  if (!current.mfaEnabled) throw new SecurityError(403, 'Your account security changed. Please sign in again.');
  throwIfLocked(current, 'mfa');
  const challenge = await createChallenge(current, 'login-mfa', LOGIN_CHALLENGE_MS);
  return { mfaRequired: true, challengeToken: challenge.token, expiresAt: challenge.expiresAt };
}

async function completeLoginMfa({ challengeToken, code, recoveryCode }, baseUrl) {
  try {
    const challenge = await readChallenge(challengeToken, 'login-mfa');
    const user = await loadAccount(challenge.userId, challenge.authVersion);
    if (!user.mfaEnabled) throw new SecurityError(403, 'Your account security changed. Please sign in again.');
    const verified = await verifyMfaProof(user, { code, recoveryCode });
    await consumeChallenge(challenge);
    const profile = await publicUser(verified, baseUrl);
    const session = await createSession(verified._id, versionOf(verified));
    return { user: profile, session };
  } catch (error) {
    // A version change invalidates the whole challenge, so the client must restart its password step.
    if (error instanceof SessionStateError || (error instanceof ServiceError && [401, 403].includes(error.status))) {
      throw new SecurityError(410, 'Your sign-in verification is no longer valid. Please start again.');
    }
    throw error;
  }
}

module.exports = {
  SecurityError, getSecurityState, changePassword,
  beginMfaSetup, confirmMfaSetup, disableMfa, regenerateRecoveryCodes, closeAccount,
  beginLoginMfa, completeLoginMfa,
};
