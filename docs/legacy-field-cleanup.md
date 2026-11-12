# Legacy split-field cleanup

After the split collections became authoritative and the app was manually
verified, the user approved removing superseded fields from the original records,
including the obsolete stored avatar URL. Main collections and their records stay.

## Exact scope

| Collection | Removed top-level fields | Authoritative replacement |
| --- | --- | --- |
| AccountList | passwordHash, authVersion, mfaEnabled, mfaSecretEncrypted, mfaRecoveryCodeHashes, mfaLastUsedStep, mfaFailedAttempts, mfaLockedUntil, securityPasswordFailedAttempts, securityPasswordLockedUntil, loginPasswordFailedAttempts, loginPasswordLockedUntil | AccountSecurity |
| AccountList | phone, bio, dob | UserProfiles |
| AccountList | avatarData, avatarMimeType | UserAvatars |
| AccountList | avatarUrl | Generated from account ID and UserAvatars presence |
| eventList | photos, imageData, imageMimeType | EventPhotos |
| StoreList | photos, imageData, imageMimeType | StorePhotos |

AccountList still owns identity fields, usernames, emails, closure state, and
archiveWriteVersion. eventList and StoreList still own their metadata and
host/owner links. IDs, timestamps, version fields outside the approved allowlist,
indexes, collection options, and all current split records are preserved.

## Administrative script

[cleanupLegacySplitFields.js](../backend/scripts/cleanupLegacySplitFields.js)
uses the native MongoDB driver without importing or starting the application.
From backend, `node scripts/cleanupLegacySplitFields.js --plan` is read only.
The approved `--apply` operation:

1. Reads a consistent snapshot and checks profile/security links, usable avatar
   and photo payloads, parent links, and photo order. Current destination values
   remain authoritative, including edits made since the original copy.
2. Exports all existing collections as native BSON into a fresh, Git-ignored,
   private backup directory. Files are flushed to disk and decoded/read back to
   verify counts, types, and fingerprints. The manifest records hashes and
   collection/index metadata. It contains no environment file or connection URI.
3. Rechecks the backed-up state and applies only the hard-coded top-level $unset
   fields to AccountList, eventList, and StoreList in one transaction. Unexpected
   concurrent changes stop the operation instead of refreshing from stale data.
4. Verifies the expected state inside the transaction and after commit. The
   private cleanup-report.json contains counts and integrity flags, never account
   credentials or image payloads. It verifies that no records or collections were
   removed and that only the allowlisted fields changed.

Backup exports contain sensitive account data and must remain private. Cleanup
does not restore or overwrite any authoritative split data. A verification
difference after a confirmed commit requires inspecting the report and concurrent
activity before attempting further changes.

## Execution record

Completed November 11, 2026, at approximately 9:08 p.m. Eastern
(`2026-11-12T02:08:10.943Z`). The transaction commit was confirmed and every
integrity check passed.

| Collection | Records cleaned | Records retained |
| --- | ---: | ---: |
| AccountList | 9 | 9 |
| eventList | 18 | 19 |
| StoreList | 0 | 0 |

All 15 collections, all record counts, IDs, timestamps, remaining fields, and
collection/index metadata were preserved. All approved legacy fields are absent.
The five authoritative split collections remained byte-for-byte unchanged:
UserProfiles 9, AccountSecurity 9, UserAvatars 2, EventPhotos 18, StorePhotos 0.

The fresh backup and verified
[cleanup-report.json](../backend/.local-backups/legacy-cleanup-2026-11-12T02-08-07-581Z-fa28e45a-ed36-4288-8015-ff8ea4d8b56a/cleanup-report.json)
are under:

`backend/.local-backups/legacy-cleanup-2026-11-12T02-08-07-581Z-fa28e45a-ed36-4288-8015-ff8ea4d8b56a/`

Only after the physical cleanup was verified were the obsolete model paths
removed. The historical copier is now retired in every mode: removed originals
cannot reconstruct current destination records.

## Files in this cleanup

| Action | File | Summary |
| --- | --- | --- |
| Created | [cleanupLegacySplitFields.js](../backend/scripts/cleanupLegacySplitFields.js) | Read-only planning, private BSON backup, exact transactional field removal, and integrity report. |
| Created | [legacy-field-cleanup.md](legacy-field-cleanup.md) | Approved scope, execution record, backup location, and this inventory. |
| Modified | [User.js](../backend/src/models/User.js) | Removes 18 superseded paths; preserves identity, closure state, and the write fence. |
| Modified | [Event.js](../backend/src/models/Event.js) | Removes obsolete embedded/single-image paths and shared schema import. |
| Modified | [Store.js](../backend/src/models/Store.js) | Removes obsolete embedded/single-image paths and shared schema import. |
| Modified | [accountReadService.js](../backend/src/services/accountReadService.js) | Updates the identity-projection comment after physical cleanup; behavior unchanged. |
| Modified | [duplicateSplitCollections.js](../backend/scripts/duplicateSplitCollections.js) | Retires all historical plan/copy/refresh modes before opening a connection. |
| Deleted | backend/src/models/photoSchema.js | Unused embedded-photo schema, replaced by EventPhoto/StorePhoto models. |
| Modified | [eventList-connection.md](eventList-connection.md) | Current event/photo storage, APIs, file links, and removal of obsolete seed instructions. |
| Modified | [stores-and-photos.md](stores-and-photos.md) | Current separate photo storage and source links. |
| Modified | [staged-database-models.md](staged-database-models.md) | Separates historical staging from active storage and completed cleanup. |
| Modified | [split-collection-copy.md](split-collection-copy.md) | Marks the original copy as historical and its commands as retired. |
| Modified | [split-collection-cutover.md](split-collection-cutover.md) | Links the later physical cleanup without changing the historical cutover record. |

No application tests, app launches, API checks, type checks, or syntax checks are
part of this cleanup. The operational snapshot, backup, and integrity comparisons
are data-safety checks; application behavior is left for manual verification.
