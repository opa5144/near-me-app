const express = require('express'); 
const argon2 = require('argon2');
const User = require('../models/User');
const AuthSession = require('../models/AuthSession');
const { createSession, requireAuth } = require('../middleware/requireAuth');
const securityRoutes = require('./security');
const { beginLoginMfa, completeLoginMfa, sendSecurityError } = require('../services/accountSecurity');

const router = express.Router(); 
// Authentication responses can contain session/challenge tokens and must not be cached.
router.use((req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
router.use('/security', securityRoutes);

const PROFILE_FIELDS = '_id firstName lastName username email phone dob bio avatarUrl';
const EDITABLE_PROFILE_FIELDS = ['username', 'email', 'phone', 'dob', 'bio'];

function profileValidationErrors(error) {
  const errors = {};
  for (const field of EDITABLE_PROFILE_FIELDS) {
    if (error.errors?.[field]) errors[field] = error.errors[field].message;
  }
  return errors;
}

// MongoDB identifies the unique index that rejected the write; do not blame the other field.
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

// Explicit response fields exclude password hashes and stored avatar bytes.
function toUserProfile(user) {
  return {
    _id: user._id,
    firstName: user.firstName,
    lastName: user.lastName,
    username: user.username,
    email: user.email,
    phone: user.phone ?? '',
    dob: user.dob ?? '',
    bio: user.bio ?? '',
    avatarUrl: user.avatarUrl ?? '',
  };
}

// A password check must not sign in an account whose credentials changed meanwhile.
function loginOwner(user) {
  return {
    _id: user._id,
    deletedAt: null,
    $expr: { $eq: [{ $ifNull: ['$authVersion', 0] }, user.authVersion ?? 0] },
  };
}

function sendLoginWait(res, lockedUntil) {
  if (!lockedUntil || new Date(lockedUntil).getTime() <= Date.now()) return false;
  const retryAfterSeconds = Math.max(1, Math.ceil((new Date(lockedUntil).getTime() - Date.now()) / 1000));
  res.set('Retry-After', String(retryAfterSeconds));
  res.status(429).json({
    message: 'Too many sign-in attempts. Please wait before trying again.',
    errors: { password: 'Too many attempts. Please wait.' },
    retryAfterSeconds,
    lockedUntil: new Date(lockedUntil).toISOString(),
  });
  return true;
}

async function recordLoginPasswordFailure(user) {
  const now = new Date();
  // The database increments the shared counter atomically, even across devices.
  return User.findOneAndUpdate({
    ...loginOwner(user),
    $or: [{ loginPasswordLockedUntil: null }, { loginPasswordLockedUntil: { $lte: now } }],
  }, [
    { $set: { loginPasswordFailedAttempts: { $add: [
      { $cond: [
        { $and: [
          { $ne: [{ $ifNull: ['$loginPasswordLockedUntil', null] }, null] },
          { $lte: ['$loginPasswordLockedUntil', now] },
        ] },
        0,
        { $ifNull: ['$loginPasswordFailedAttempts', 0] },
      ] },
      1,
    ] } } },
    { $set: { loginPasswordLockedUntil: {
      $cond: [{ $gte: ['$loginPasswordFailedAttempts', 5] }, new Date(now.getTime() + 5 * 60 * 1000), null],
    } } },
  ], { new: true, updatePipeline: true }).select('+loginPasswordLockedUntil');
}

// Closed accounts keep their usernames reserved; an availability check cannot restore them.
router.get('/username-availability', async (req, res) => {
  const username = typeof req.query.username === 'string' ? req.query.username.trim() : '';
  if (!/^[A-Za-z0-9]{1,25}$/.test(username)) {
    return res.status(400).json({
      message: 'Use 1 to 25 letters and numbers for your username.',
      errors: { username: 'Use 1 to 25 letters and numbers.' },
    });
  }
  try { return res.json({ available: !(await User.exists({ username })) }); }
  catch (err) { return res.status(503).json({ message: 'Unable to check this username. Please try again.' }); }
});

// Collect field errors together, and still enforce uniqueness on the final insert.
router.post('/signup', async (req, res) => {
  try {
    const body = req.body ?? {};
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
    if (Object.keys(errors).length) return res.status(400).json({ message: 'Please correct the highlighted fields.', errors });

    await User.init();
    // Password spaces and Unicode are preserved; the device never receives the hash.
    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    const user = await User.create({ ...account, passwordHash });
    return res.status(201).json({
      message: 'Account Created.',
      user: { _id: user._id, firstName: user.firstName, lastName: user.lastName, username: user.username, email: user.email },
    });
  } catch (err) {
    if (err.code === 11000) {
      const errors = duplicateProfileErrors(err);
      if (errors.username) errors.username = 'Username already exists.';
      if (errors.email) errors.email = 'Email already exists.';
      return res.status(409).json({ message: Object.values(errors)[0] || 'Username or email already exists.', errors });
    }
    if (err.name === 'ValidationError') {
      const errors = {};
      for (const field of ['firstName', 'lastName', 'username', 'email']) {
        if (err.errors?.[field]) errors[field] = err.errors[field].message;
      }
      return res.status(400).json({ message: 'Please check your account details.', errors });
    }
    console.error('Signup failed:', err.name);
    return res.status(500).json({ message: 'Unable to create your account. Please try again.' });
  }
});


// MFA-enabled accounts receive only a short-lived challenge after the password step.
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body ?? {};
    if (typeof email !== 'string' || typeof password !== 'string' || !email.trim() || !password) {
      return res.status(400).json({ message: 'Email and password are required.' });
    }
    const invalidCredentials = 'Invalid email or password.';
    if (Array.from(password).length > 128) {
      return res.status(401).json({ message: invalidCredentials });
    }
    // Password hashes are normally hidden; include this one only to verify the password.
    const user = await User.findOne({ email: email.trim().toLowerCase(), deletedAt: null })
      .select('+passwordHash +authVersion +mfaEnabled +loginPasswordFailedAttempts +loginPasswordLockedUntil');
    if (!user) return res.status(401).json({ message: invalidCredentials });
    if (sendLoginWait(res, user.loginPasswordLockedUntil)) return;
    if (!(await argon2.verify(user.passwordHash, password))) {
      const failed = await recordLoginPasswordFailure(user);
      const latest = failed || await User.findOne({ _id: user._id, deletedAt: null }).select('+loginPasswordLockedUntil');
      if (sendLoginWait(res, latest?.loginPasswordLockedUntil)) return;
      return res.status(401).json({ message: invalidCredentials });
    }

    const reset = await User.updateOne({
      ...loginOwner(user),
      $or: [{ loginPasswordLockedUntil: null }, { loginPasswordLockedUntil: { $lte: new Date() } }],
    }, {
      $set: { loginPasswordFailedAttempts: 0, loginPasswordLockedUntil: null },
    });
    if (!reset.matchedCount) {
      const latest = await User.findOne({ _id: user._id, deletedAt: null }).select('+loginPasswordLockedUntil');
      if (sendLoginWait(res, latest?.loginPasswordLockedUntil)) return;
      return res.status(401).json({ message: invalidCredentials });
    }
    if (user.mfaEnabled) return res.json(await beginLoginMfa(user));

    // The client keeps this token and sends it in future Authorization headers.
    const session = await createSession(user._id, user.authVersion ?? 0);
    return res.status(200).json({
      message: 'Login successful.',
      ...session,
      user: {
        _id: user._id, firstName: user.firstName, lastName: user.lastName,
        username: user.username, email: user.email,
      },
    });
  } catch (err) {
    if (err.name === 'SessionStateError') return res.status(401).json({ message: 'Please sign in again.' });
    if (sendSecurityError(res, err)) return;
    console.error('Login failed:', err.name);
    return res.status(500).json({ message: 'Unable to log in. Please try again.' });
  }
});

// A challenge cannot access protected routes; the full session starts only here.
router.post('/login/mfa', async (req, res) => {
  try {
    const { challengeToken, code, recoveryCode } = req.body ?? {};
    const { user, session } = await completeLoginMfa({ challengeToken, code, recoveryCode });
    return res.json({
      message: 'Login successful.',
      ...session,
      user: {
        _id: user._id, firstName: user.firstName, lastName: user.lastName,
        username: user.username, email: user.email, avatarUrl: user.avatarUrl ?? '',
      },
    });
  } catch (err) {
    if (err.name === 'SessionStateError') return res.status(401).json({ message: 'Please sign in again.' });
    if (sendSecurityError(res, err)) return;
    console.error('MFA login failed:', err.name);
    return res.status(500).json({ message: 'Unable to finish signing in. Please try again.' });
  }
});

// Restore the signed-in profile from the session instead of trusting a client-supplied user ID.
router.get('/me', requireAuth, async (req, res) => {
  try {
    const user = await User.findOne({ _id: req.userId, deletedAt: null }).select(PROFILE_FIELDS);
    if (!user) return res.status(401).json({ message: 'Please log in again.' });
    return res.json({ user: toUserProfile(user) });
  } catch (err) {
    return res.status(500).json({ message: 'Unable to load your account.' });
  }
});

// The session supplies the owner; only these five editable fields are accepted.
router.patch('/me', requireAuth, async (req, res) => {
  try {
    const body = req.body;
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return res.status(400).json({ message: 'Please submit your account details.', errors: {} });
    }

    const updates = {};
    const errors = {};
    for (const field of EDITABLE_PROFILE_FIELDS) {
      if (!Object.prototype.hasOwnProperty.call(body, field)) continue;
      if (typeof body[field] !== 'string') {
        errors[field] = 'This field must be text.';
        continue;
      }
      // Saving an empty optional string clears that detail; omitted fields stay unchanged.
      updates[field] = body[field].trim();
    }
    if (updates.email !== undefined) {
      updates.email = updates.email.toLowerCase();
    }
    // Accept raw digits or the displayed format, and store both forms identically.
    if (updates.phone && /^\d{11}$/.test(updates.phone)) {
      const digits = updates.phone;
      updates.phone = digits[0] + ' ' + digits.slice(1, 4) + '-' + digits.slice(4, 7) + '-' + digits.slice(7);
    }

    if (Object.keys(updates).length > 0) {
      try {
        // Validate only supplied fields and collect every field error before any database write.
        await User.validate(updates, Object.keys(updates));
      } catch (error) {
        if (error.name !== 'ValidationError') throw error;
        Object.assign(errors, profileValidationErrors(error));
      }
    }
    if (Object.keys(errors).length > 0) {
      return res.status(400).json({ message: 'Please correct the highlighted fields.', errors });
    }
    if (Object.keys(updates).length === 0) {
      return res.status(400).json({
        message: 'Please submit at least one account field to update.', errors: {},
      });
    }

    // Apply one validated update and return the saved profile rather than echoing input.
    const user = await User.findOneAndUpdate(loginOwner({ _id: req.userId, authVersion: req.authVersion }), { $set: updates }, {
      new: true,
      runValidators: true,
    }).select(PROFILE_FIELDS);
    if (!user) return res.status(401).json({ message: 'Please log in again.' });
    return res.json({ user: toUserProfile(user) });
  } catch (err) {
    if (err.code === 11000) {
      const errors = duplicateProfileErrors(err);
      return res.status(409).json({
        message: Object.values(errors)[0] || 'Username or email is already in use.', errors,
      });
    }
    if (err.name === 'ValidationError') {
      return res.status(400).json({
        message: 'Please correct the highlighted fields.', errors: profileValidationErrors(err),
      });
    }
    console.error('Account update failed:', err.name);
    return res.status(500).json({ message: 'Unable to save your account. Please try again.' });
  }
});

// Remove only this login session, immediately invalidating its token.
router.post('/logout', requireAuth, async (req, res) => {
  try {
    await AuthSession.deleteOne({ _id: req.authSessionId });
    return res.sendStatus(204);
  } catch (err) {
    return res.status(500).json({ message: 'Unable to log out. Please try again.' });
  }
});

module.exports = router;
