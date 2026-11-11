const argon2 = require('argon2');
const User = require('../models/User');
const { createSession, deleteSession } = require('./sessionService');
const { beginLoginMfa, completeLoginMfa } = require('./accountSecurity');
const { ServiceError } = require('./serviceError');

const PROFILE_FIELDS = '_id firstName lastName username email phone dob bio avatarUrl';
const EDITABLE_PROFILE_FIELDS = ['username', 'email', 'phone', 'dob', 'bio'];

function profileValidationErrors(error) {
  const errors = {};
  for (const field of EDITABLE_PROFILE_FIELDS) {
    if (error.errors?.[field]) errors[field] = error.errors[field].message;
  }
  return errors;
}

function duplicateProfileErrors(error) {
  const errors = {};
  for (const field of ['username', 'email']) {
    if (Object.prototype.hasOwnProperty.call(error.keyPattern ?? {}, field) ||
        Object.prototype.hasOwnProperty.call(error.keyValue ?? {}, field)) {
      errors[field] = field === 'username' ? 'Username is already in use.' : 'Email is already in use.';
    }
  }
  return errors;
}

// Explicit profile fields exclude password hashes and stored avatar bytes.
function toUserProfile(user) {
  return {
    _id: user._id, firstName: user.firstName, lastName: user.lastName,
    username: user.username, email: user.email,
    phone: user.phone ?? '', dob: user.dob ?? '', bio: user.bio ?? '', avatarUrl: user.avatarUrl ?? '',
  };
}

function loginOwner(user) {
  return {
    _id: user._id, deletedAt: null,
    $expr: { $eq: [{ $ifNull: ['$authVersion', 0] }, user.authVersion ?? 0] },
  };
}

function throwIfLoginLocked(lockedUntil) {
  if (!lockedUntil || new Date(lockedUntil).getTime() <= Date.now()) return;
  throw new ServiceError(429, 'Too many sign-in attempts. Please wait before trying again.', {
    errors: { password: 'Too many attempts. Please wait.' },
    retryAfterSeconds: Math.max(1, Math.ceil((new Date(lockedUntil).getTime() - Date.now()) / 1000)),
    lockedUntil: new Date(lockedUntil).toISOString(),
  });
}

async function recordLoginPasswordFailure(user) {
  const now = new Date();
  // Count failures atomically across devices, resetting an expired lock first.
  return User.findOneAndUpdate({
    ...loginOwner(user),
    $or: [{ loginPasswordLockedUntil: null }, { loginPasswordLockedUntil: { $lte: now } }],
  }, [
    { $set: { loginPasswordFailedAttempts: { $add: [
      { $cond: [
        { $and: [
          { $ne: [{ $ifNull: ['$loginPasswordLockedUntil', null] }, null] },
          { $lte: ['$loginPasswordLockedUntil', now] },
        ] }, 0, { $ifNull: ['$loginPasswordFailedAttempts', 0] },
      ] }, 1,
    ] } } },
    { $set: { loginPasswordLockedUntil: {
      $cond: [{ $gte: ['$loginPasswordFailedAttempts', 5] }, new Date(now.getTime() + 5 * 60 * 1000), null],
    } } },
  ], { new: true, updatePipeline: true }).select('+loginPasswordLockedUntil');
}

async function getUsernameAvailability(value) {
  const username = typeof value === 'string' ? value.trim() : '';
  if (!/^[A-Za-z0-9]{1,25}$/.test(username)) {
    throw new ServiceError(400, 'Use 1 to 25 letters and numbers for your username.', {
      errors: { username: 'Use 1 to 25 letters and numbers.' },
    });
  }
  try { return { available: !(await User.exists({ username })) }; }
  catch { throw new ServiceError(503, 'Unable to check this username. Please try again.'); }
}

async function signup(input) {
  try {
    const body = input ?? {};
    const account = {};
    const errors = {};
    const labels = { firstName: 'First name', lastName: 'Last name', username: 'Username', email: 'Email' };
    for (const [field, label] of Object.entries(labels)) {
      if (typeof body[field] !== 'string' || !body[field].trim()) errors[field] = label + ' is required.';
      else account[field] = body[field].trim();
    }
    if (account.username && !/^[A-Za-z0-9]{1,25}$/.test(account.username)) {
      errors.username = 'Use only letters and numbers, up to 25 characters.';
    }
    if (account.email) {
      account.email = account.email.toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(account.email)) errors.email = 'Enter a valid email address.';
    }
    const password = body.password;
    if (typeof password !== 'string' || !password) errors.password = 'Password is required.';
    else if (Array.from(password).length < 15 || Array.from(password).length > 128) {
      errors.password = 'Password must contain 15 to 128 characters.';
    }
    if (Object.keys(errors).length) {
      throw new ServiceError(400, 'Please correct the highlighted fields.', { errors });
    }
    await User.init();
    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    const user = await User.create({ ...account, passwordHash });
    return {
      message: 'Account Created.',
      user: { _id: user._id, firstName: user.firstName, lastName: user.lastName, username: user.username, email: user.email },
    };
  } catch (error) {
    if (error.code === 11000) {
      const errors = duplicateProfileErrors(error);
      if (errors.username) errors.username = 'Username already exists.';
      if (errors.email) errors.email = 'Email already exists.';
      throw new ServiceError(409, Object.values(errors)[0] || 'Username or email already exists.', { errors });
    }
    if (error.name === 'ValidationError') {
      const errors = {};
      for (const field of ['firstName', 'lastName', 'username', 'email']) {
        if (error.errors?.[field]) errors[field] = error.errors[field].message;
      }
      throw new ServiceError(400, 'Please check your account details.', { errors });
    }
    throw error;
  }
}

async function login(input) {
  const { email, password } = input ?? {};
  if (typeof email !== 'string' || typeof password !== 'string' || !email.trim() || !password) {
    throw new ServiceError(400, 'Email and password are required.');
  }
  const invalidCredentials = 'Invalid email or password.';
  if (Array.from(password).length > 128) throw new ServiceError(401, invalidCredentials);
  const user = await User.findOne({ email: email.trim().toLowerCase(), deletedAt: null })
    .select('+passwordHash +authVersion +mfaEnabled +loginPasswordFailedAttempts +loginPasswordLockedUntil');
  if (!user) throw new ServiceError(401, invalidCredentials);
  throwIfLoginLocked(user.loginPasswordLockedUntil);
  if (!(await argon2.verify(user.passwordHash, password))) {
    const failed = await recordLoginPasswordFailure(user);
    const latest = failed || await User.findOne({ _id: user._id, deletedAt: null }).select('+loginPasswordLockedUntil');
    throwIfLoginLocked(latest?.loginPasswordLockedUntil);
    throw new ServiceError(401, invalidCredentials);
  }
  const reset = await User.updateOne({
    ...loginOwner(user),
    $or: [{ loginPasswordLockedUntil: null }, { loginPasswordLockedUntil: { $lte: new Date() } }],
  }, { $set: { loginPasswordFailedAttempts: 0, loginPasswordLockedUntil: null } });
  if (!reset.matchedCount) {
    const latest = await User.findOne({ _id: user._id, deletedAt: null }).select('+loginPasswordLockedUntil');
    throwIfLoginLocked(latest?.loginPasswordLockedUntil);
    throw new ServiceError(401, invalidCredentials);
  }
  if (user.mfaEnabled) return beginLoginMfa(user);
  const session = await createSession(user._id, user.authVersion ?? 0);
  return {
    message: 'Login successful.', ...session,
    user: {
      _id: user._id, firstName: user.firstName, lastName: user.lastName,
      username: user.username, email: user.email,
    },
  };
}

async function loginMfa(input) {
  const { challengeToken, code, recoveryCode } = input ?? {};
  const { user, session } = await completeLoginMfa({ challengeToken, code, recoveryCode });
  return {
    message: 'Login successful.', ...session,
    user: {
      _id: user._id, firstName: user.firstName, lastName: user.lastName,
      username: user.username, email: user.email, avatarUrl: user.avatarUrl ?? '',
    },
  };
}

async function getProfile(auth) {
  const user = await User.findOne({ _id: auth.userId, deletedAt: null }).select(PROFILE_FIELDS);
  if (!user) throw new ServiceError(401, 'Please log in again.');
  return { user: toUserProfile(user) };
}

async function updateProfile(auth, body) {
  try {
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw new ServiceError(400, 'Please submit your account details.', { errors: {} });
    }
    const updates = {};
    const errors = {};
    for (const field of EDITABLE_PROFILE_FIELDS) {
      if (!Object.prototype.hasOwnProperty.call(body, field)) continue;
      if (typeof body[field] !== 'string') {
        errors[field] = 'This field must be text.';
        continue;
      }
      updates[field] = body[field].trim();
    }
    if (updates.email !== undefined) updates.email = updates.email.toLowerCase();
    if (updates.phone && /^\d{11}$/.test(updates.phone)) {
      const digits = updates.phone;
      updates.phone = digits[0] + ' ' + digits.slice(1, 4) + '-' + digits.slice(4, 7) + '-' + digits.slice(7);
    }
    if (Object.keys(updates).length > 0) {
      try { await User.validate(updates, Object.keys(updates)); }
      catch (error) {
        if (error.name !== 'ValidationError') throw error;
        Object.assign(errors, profileValidationErrors(error));
      }
    }
    if (Object.keys(errors).length) {
      throw new ServiceError(400, 'Please correct the highlighted fields.', { errors });
    }
    if (!Object.keys(updates).length) {
      throw new ServiceError(400, 'Please submit at least one account field to update.', { errors: {} });
    }
    const user = await User.findOneAndUpdate(loginOwner({ _id: auth.userId, authVersion: auth.authVersion }), {
      $set: updates,
    }, { new: true, runValidators: true }).select(PROFILE_FIELDS);
    if (!user) throw new ServiceError(401, 'Please log in again.');
    return { user: toUserProfile(user) };
  } catch (error) {
    if (error.code === 11000) {
      const errors = duplicateProfileErrors(error);
      throw new ServiceError(409, Object.values(errors)[0] || 'Username or email is already in use.', { errors });
    }
    if (error.name === 'ValidationError') {
      throw new ServiceError(400, 'Please correct the highlighted fields.', { errors: profileValidationErrors(error) });
    }
    throw error;
  }
}

async function logout(auth) {
  await deleteSession(auth.sessionId);
}

module.exports = { getUsernameAvailability, signup, login, loginMfa, getProfile, updateProfile, logout };
