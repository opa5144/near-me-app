# Additive collection copy

Completed on November 11, 2026, at approximately 8:14 p.m. America/New_York
(`2026-11-12T01:14:05.835Z`). This operation copied data into the five staged
collections. It did not move, update, remove, or rewrite original documents.
The existing application continues to use the original models and services.

## Verified results

| New collection | Inserted and verified |
| --- | ---: |
| UserProfiles | 9 |
| AccountSecurity | 9 |
| UserAvatars | 2 |
| EventPhotos | 17 |
| StorePhotos | 0 |
| Total new documents | 37 |

StorePhotos was created with its index but remains empty because StoreList had
no documents. Avatars were copied only for the two accounts with stored binary
avatars. Seventeen events had stored photos; the event with no image did not
receive a fabricated photo.

All original collection counts, full-document BSON fingerprints, options,
collection identities, and index metadata matched before and after:

| Original collection | Before | After |
| --- | ---: | ---: |
| AccountList | 9 | 9 |
| AuthChallenges | 0 | 0 |
| AuthSessions | 0 | 0 |
| EventSelections | 10 | 10 |
| NotificationSettings | 1 | 1 |
| StoreList | 0 | 0 |
| UserPreferences | 1 | 1 |
| activities | 0 | 0 |
| eventList | 18 | 18 |
| friendships | 0 | 0 |

The uppercase EventList collection was already absent when this operation began;
this script did not delete it. These counts are the operation's snapshot and
can differ from earlier inspections, particularly for expiring authentication
records.

## Files and backup

- Created [duplicateSplitCollections.js](../backend/scripts/duplicateSplitCollections.js).
- Modified [.gitignore](../.gitignore) to exclude `backend/.local-backups/`.
- Updated [staged-database-models.md](staged-database-models.md) to distinguish
  the original model-only stage from the now-completed copy.
- Added this operation summary.

The private backup and verification report are in:

`backend/.local-backups/split-copy-2026-11-12T01-14-01-787Z-706cfe97-4255-4ab9-b5a5-2cbaebdd4d15/`

The directory contains numbered BSON exports of every original collection and
the destinations' pre-copy contents. `manifest.ejson` maps filenames to collection
names and includes document counts, file hashes, and original collection/index
metadata. Each BSON export was read back and compared before destination writes.
`copy-report.json` records the resulting counts and integrity checks without
including individual record values. NTFS permissions restrict the backup to the
current user, SYSTEM, and local Administrators. The backup directory is excluded
from Git; no credentials or environment file were exported.

## Copy rules

- The only writable collection names are UserProfiles, AccountSecurity,
  UserAvatars, EventPhotos, and StorePhotos.
- New indexes were explicitly provisioned only on those five collections.
- Native MongoDB reads preserve BSON types. The staged Mongoose models are used
  only for validation; their Mongoose connection is never opened.
- Account copies retain the original account ID as both their `_id` and `userId`.
  Only fields belonging to each staged schema are copied. Missing optional fields
  receive the schema's existing defaults; explicit stored values are not reset.
- Password hashes, encrypted MFA values, recovery-code hashes, lockouts, and
  authentication versions are copied as stored. No rehashing, decryption,
  re-enrollment, or session revocation occurs.
- Closed accounts are included as inert copies. Their original deletedAt state
  remains untouched, so copying does not reactivate an account.
- Photo parent IDs and display order are preserved. Embedded photo IDs are
  retained; legacy single photos receive deterministic IDs. Source timestamps
  are preserved, using parent timestamps where a photo had none.
- An explicit source photos array is authoritative, including an empty array;
  stale legacy fields do not resurrect a removed photo.
- Existing identical target records are skipped. Changed or unexpected target
  records cause a conflict before insertion; nothing is overwritten.
- All missing documents are inserted in one transaction. Source changes detected
  before committing abort those destination inserts. Fresh post-commit reads
  compare the entire destination documents and all original fingerprints.

## Commands and remaining scope

From `backend`:

```text
node scripts/duplicateSplitCollections.js --plan
node scripts/duplicateSplitCollections.js --apply
```

`--plan` reads and validates without creating collections or writing records.
`--apply` performs a new private backup and inserts missing exact copies only.
Running it later against changed source data can report conflicts rather than
overwrite stale copies. Current originals can continue to change through normal
application use, so these new collections are not a live synchronization system.

The operational preflight, schema/BSON validation, backup read-back, transactional
copy, and integrity comparisons completed successfully. No application tests,
lint, API functionality tests, or app launches were run. Service/controller
cutover, ongoing synchronization, source-field removal, and legacy collection
cleanup remain outside this operation and need separate approval.
