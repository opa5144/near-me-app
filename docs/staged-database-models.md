# Staged database models

The initial stage added five model definitions for the proposed collection split. It
does not switch the application to the new layout. Existing models, controllers,
services, route wiring, and database records continue using the current layout.

During that initial model-only stage, no backup, migration, copy, cleanup, account
update, image rewrite, or collection creation was run. No database connection was
opened for that stage. A later approved [additive copy](split-collection-copy.md)
has now populated the new collections without changing the originals. The new files
are not imported by startup or existing services. Their schemas explicitly set
`autoCreate: false` and `autoIndex: false` to prevent automatic collection/index
creation if they are imported while connected in the future. They are ordinary
Mongoose models, not a read-only connection: a later deliberate write or explicit
index/collection creation would still need authorization and rollout work.

## New model definitions

All five models use normal `_id` values and `createdAt`/`updatedAt` timestamps.
References use the existing Mongoose model names, so the corresponding account,
event, and store IDs can remain stable during a later migration.

| New file | Intended collection | Defined data and relationship |
| --- | --- | --- |
| [UserProfile.js](../backend/src/models/UserProfile.js) | `UserProfiles` | Unique required `userId` referencing User, with phone, bio, and date of birth using the existing defaults and validation. |
| [AccountSecurity.js](../backend/src/models/AccountSecurity.js) | `AccountSecurity` | Unique required `userId` referencing User, password hash, authentication version, MFA state/encrypted secret/recovery hashes, replay counter, failure counters, and lockout dates. Security fields are hidden from ordinary queries. |
| [UserAvatar.js](../backend/src/models/UserAvatar.js) | `UserAvatars` | Unique required `userId` referencing User, required binary avatar data and MIME type, both hidden from ordinary queries. Avatar URLs can be derived from the account ID when services are changed later. |
| [EventPhoto.js](../backend/src/models/EventPhoto.js) | `EventPhotos` | Required `eventId` referencing Event, hidden required JPEG bytes up to 1 MiB, MIME type, and integer `displayOrder` from 0 to 4. |
| [StorePhoto.js](../backend/src/models/StorePhoto.js) | `StorePhotos` | Required `storeId` referencing Store, hidden required JPEG bytes up to 1 MiB, MIME type, and integer `displayOrder` from 0 to 4. |

The avatar definition retains the current MIME-type compatibility rather than
restricting existing avatars to JPEGs. Event/store photos retain the current
JPEG-only format and size rule.

The profile, security, and avatar schemas declare unique `userId` indexes for
one-to-one relationships. Photo schemas declare unique `(eventId, displayOrder)`
or `(storeId, displayOrder)` indexes. Five distinct positions from 0 through 4
support the existing five-photo limit, with position 0 as the cover. These indexes
were declarations only in the initial stage. The subsequent additive copy
explicitly created these indexes on the five new collections only.

MongoDB does not enforce the references themselves. The later service rollout
must retain active-owner checks, ownership-derived IDs, transactional writes,
and ordering validation. `unique` is an index declaration rather than a Mongoose
validator; global uniqueness requires those indexes to be explicitly provisioned.

## Current behavior remains active

- Account identity, profile, avatar, and security fields remain in `AccountList`
  through the unchanged User model and services.
- `deletedAt` and the account-wide `archiveWriteVersion` transaction fence remain
  in the existing User model. This stage does not relocate account-closure locks.
- Event photos remain embedded or in the supported legacy image fields.
- Store photos remain embedded, and business hours remain embedded in stores.
- City subscriptions remain embedded in UserPreferences.
- No current account IDs, sessions, event IDs, store IDs, or photo IDs are changed.
- The `activities` and `EventList` collections are not removed or altered.

Adding these files alone did not create the collections in Atlas. The subsequent
approved copy created/populated them, but current application services still do
not read or write them. Copies are a snapshot, not an automatically synchronized
replacement for the original data.

## Later approval required

The future coordinated rollout will need a current backup, reconciliation of any
source changes since copying, and updates to services and serializers. The
additive copy script verifies existing exact matches and refuses conflicts; it
does not silently refresh existing copies. Authentication version checks, MFA, lockouts, session revocation,
and account-closure transactions must be changed together with the security data
location. Photo migration must preserve legacy images and IDs/references before
any old image fields are removed. Those tasks are intentionally deferred.

The initial model-only work used source/diff inspection without tests, app startup,
or database calls. The later additive copy performed the authorized data preflight,
backup, writes to new collections, and integrity verification documented separately.
Application services and original database records remain unchanged.
