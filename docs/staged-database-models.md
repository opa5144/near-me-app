# Staged database models

Current status: the subsequent [code cutover](split-collection-cutover.md) now
uses these collections. The staging and copy notes below describe earlier phases.
Active services use the separate collections. The subsequent approved
[legacy-field cleanup](legacy-field-cleanup.md) removed duplicated original
fields after a fresh backup and successful integrity verification.

The initial stage added five model definitions for the proposed collection split. It
did not switch the application to the new layout. At that point, existing models,
controllers, services, route wiring and records continued using the original layout.

During that initial model-only stage, no backup, migration, copy, cleanup, account
update, image rewrite, or collection creation was run. No database connection was
opened for that stage. A later approved [additive copy](split-collection-copy.md)
has now populated the new collections without changing the originals. The new files
were not initially imported by startup or existing services. Their schemas set
`autoCreate: false` and `autoIndex: false` to prevent automatic collection/index
creation even when imported while connected. They are now imported by the active
services after the approved rollout. Automatic DDL remains disabled; these are
ordinary writable Mongoose models, not a read-only connection.

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

MongoDB does not enforce the references themselves. The service rollout retains
active-owner checks, ownership-derived IDs, transactional writes and ordering
validation. `unique` is an index declaration rather than a Mongoose
validator; global uniqueness requires those indexes to be explicitly provisioned.

## Behavior during the model-only stage (historical)

- Account identity, profile, avatar and security fields were still read from
  `AccountList` through the original User model and services.
- `deletedAt` and the account-wide `archiveWriteVersion` transaction fence stayed
  in the User model; the model-only stage did not relocate account-closure locks.
- Event photos were embedded or stored in legacy single-image fields.
- Store photos were embedded; business hours were part of store metadata.
- City subscriptions stayed embedded in UserPreferences.
- Account, session, event, store and photo IDs were not changed by model staging.
- The `activities` and `EventList` collections were not removed or altered.

Adding these files alone did not create the collections in Atlas. The subsequent
approved copy created/populated them. The code cutover subsequently made the new
collections authoritative for their split data. The initial copies were snapshots;
after cutover, current services read and write the separate collections directly.

## Rollout and cleanup

The coordinated rollout required a current backup, explicitly approved
reconciliation, and updates to services and serializers. Authentication versions,
MFA, lockouts, revocation and account-closure transactions moved together with the
security authority. Photo reads and future writes moved to the new collections
without a runtime fallback to original media. See the cutover report for details.

The historical copy script is retired in all modes after physical cleanup;
removed or stale originals must not overwrite newer authoritative data. That
separate approved operation is recorded in the cleanup report. This staging
document describes the original model rollout and is not a copy/seed runbook.

The initial model-only work used source/diff inspection without tests, app startup,
or database calls. The later additive copy performed the authorized data preflight,
backup, writes to new collections, and integrity verification documented separately.
Application services were changed by the later code cutover, not by model staging.
Any later source-field cleanup has its own backup and verification record.
