# Security and login

Security & Login loads the signed-in account's saved MFA state. Passwords are
verified against Argon2id hashes on the backend and are never returned to the app.
New passwords must contain 15 to 128 Unicode characters; password spaces are
preserved. Password updates rotate the current session and revoke other sessions.

## Authenticator setup and recovery

Google Authenticator uses standard six-digit TOTP codes. The backend generates a
QR image and a manual setup key using OTPAuth and qrcode; the app does not send
setup secrets to an external QR service. On the same phone, copy the selectable
manual key into Google Authenticator. Enabling or replacing MFA requires a valid
code from the newly configured authenticator before the saved setting changes.

Existing MFA must be verified before replacing/disabling it, changing a password,
regenerating recovery codes, or closing the account. Recovery codes can be used
instead of an authenticator code. A successful setup or regeneration displays
the new recovery codes once, with a save acknowledgment. Only code hashes are
retained in Atlas; each code is consumed atomically once. Regenerating them
invalidates all older recovery codes.

Authenticator secrets and pending setup secrets are encrypted with AES-256-GCM.
`MFA_ENCRYPTION_KEY` in `backend/.env` must be a random 32-byte base64 value. The
implementation added a private key to this workspace's ignored `.env` if absent.
Keep that value private, stable across restarts, and backed up: replacing or
losing it prevents existing authenticator secrets from being decrypted. Configure
the same value through the deployment's secret manager when deploying this
backend. Setup must fail closed if the key is missing or invalid.

Login with MFA returns an expiring challenge after password verification, not a
usable session. The backend issues the full session only after a valid
authenticator or recovery code. Challenges are stored hashed and checked for
expiry explicitly. Authenticator time steps and recovery codes cannot be replayed.
Five failed MFA attempts cause an account-wide five-minute wait, even after
restarting the app, using another device, or requesting another challenge.
Password-login attempts have a separate persisted five-attempt/five-minute limit.

## Permanent account closure

The Delete Account action requires the current password, MFA proof when enabled,
and typing `DELETE`. Closure is permanent through the application: it records
`deletedAt`, invalidates sessions/challenges, blocks sign-in, and returns the
current device to Login. There is no restore or MFA-recovery bypass for a closed
account. Unique usernames/emails remain reserved by the retained account.

Account, event, activity, and relationship records are retained. Application
routes treat the closed account and its owned records as read-only, hide its
events from public discovery/detail/image requests, omit it from friends lists,
and reject new or updated relationships involving it. Event and relationship
writes run in account-fenced transactions so an in-flight mutation cannot commit
after closure has archived the participating account. These transactions use the
Atlas replica-set connection already configured for this project.
The backend does not change
Atlas administrator permissions or remove records from the database.

## API

- `POST /api/auth/login`: credentials, then either a full session or MFA challenge.
- `POST /api/auth/login/mfa`: complete the pending challenge with one proof.
- `GET /api/auth/security`: saved MFA state and remaining recovery-code count.
- `POST /api/auth/security/password`: change password and rotate the session.
- `POST /api/auth/security/mfa/setup`: start setup/replacement after current proof.
- `POST /api/auth/security/mfa/confirm`: verify setup and return new recovery codes.
- `POST /api/auth/security/mfa/disable`: disable after verifying current proof.
- `POST /api/auth/security/mfa/recovery-codes`: replace the recovery-code set.
- `DELETE /api/auth/security/account`: permanently close the account.

Field failures use `{ message, errors }`; lockouts also return
`retryAfterSeconds`, `lockedUntil`, and the `Retry-After` header. Wrong current
passwords or codes do not masquerade as expired sessions. Secrets and passwords
must never be included in logs or general profile responses.

Implementation references: [OTPAuth](https://github.com/hectorm/otpauth),
[node-qrcode](https://github.com/soldair/node-qrcode), and
[RFC 6238](https://www.rfc-editor.org/rfc/rfc6238).

No tests, type checks, lint, app launches, or API calls were run for this feature,
as requested. Installing dependencies and generating local configuration did not
connect to Atlas or write account data.

## Changed files

Modified:

- `backend/package.json`
- `backend/package-lock.json`
- `backend/src/models/User.js`
- `backend/src/models/AuthSession.js`
- `backend/src/middleware/requireAuth.js`
- `backend/src/routes/auth.js`
- `backend/src/routes/events.js`
- `backend/src/routes/friends.js`
- `backend/src/routes/itinerary.js`
- `backend/src/routes/users.js`
- `mobile/src/api/client.ts`
- `mobile/src/screens/auth/LoginScreen.tsx`
- `mobile/src/screens/settings/SecurityScreen.tsx`
- `backend/.env` (ignored private configuration; MFA encryption key added)

Added:

- `backend/src/models/AuthChallenge.js`
- `backend/src/routes/security.js`
- `backend/src/services/accountSecurity.js`
- `backend/src/services/activeAccountWrite.js`
- `mobile/src/api/security.ts`
- `docs/security-login.md`
