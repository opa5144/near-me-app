# Split-collection code cutover

Current status: the separately approved [legacy-field cleanup](legacy-field-cleanup.md)
has now removed superseded original fields and their schema declarations. The
inventory below records the earlier cutover, before that physical cleanup.

The backend now uses UserProfiles, AccountSecurity, UserAvatars, EventPhotos,
and StorePhotos as the authoritative locations for the data copied into them.
AccountList remains responsible for identity, usernames, emails, closure state,
and the account-wide write fence. eventList and StoreList remain the main event
and store collections. Existing API URLs and public response shapes are retained.
Routes, controllers, services, and models keep their existing separation; services
receive plain values rather than Express request/response objects.

## Authorized reconciliation before cutover

The first read-only comparison detected changes from the user's application
testing. Profile field values matched, but one profile copy's source timestamp
had advanced. One account security copy differed in mfaLastUsedStep and timestamp.
Passwords, encrypted MFA secrets, authentication versions, and lockouts matched.

After the user authorized copying those differences, a fresh private backup was
created and only one UserProfiles document and one AccountSecurity document were
refreshed. No originals were updated or deleted. Native BSON types, timestamps,
password hashes, encrypted values, and links were preserved. Full original
document fingerprints, counts, collection identities/options, and indexes matched
before and after reconciliation.

Reconciliation completed November 11, 2026, approximately 8:39 p.m. Eastern:

| Authoritative collection | Verified documents | Refreshed |
| --- | ---: | ---: |
| UserProfiles | 9 | 1 |
| AccountSecurity | 9 | 1 |
| UserAvatars | 2 | 0 |
| EventPhotos | 17 | 0 |
| StorePhotos | 0 | 0 |

The backup, manifest, and copy-report.json are under:

`backend/.local-backups/split-copy-2026-11-12T01-39-11-535Z-b00f185c-953d-4df2-ae15-b31e6b226ca2/`

The folder is Git-ignored and uses restrictive NTFS permissions. The backup
permission helper now changes the DACL through icacls without changing owner or
audit sections, which avoids requiring SeSecurityPrivilege. An earlier refresh
attempt stopped at this permission check before exporting or copying any data.

## Runtime behavior

- Signup creates AccountList identity, UserProfiles, and AccountSecurity records
  sequentially in one MongoDB transaction. New identity records do not receive
  duplicate legacy profile, password, MFA, or avatar defaults.
- Login, password verification, MFA, recovery-code consumption, replay protection,
  lockouts, and authentication versions use AccountSecurity only. Missing split
  data fails explicitly instead of falling back to a stale original copy.
- Session checks verify both active identity and the authoritative security
  version, including before and after token creation.
- The shared write fence locks participating AccountList records, then checks
  AccountSecurity's version within the transaction. Security mutations use that
  same fence. Failed-proof counters commit before the service throws its error.
- Account closure sets AccountList.deletedAt and increments AccountSecurity's
  version in one transaction. Session/challenge cleanup follows that commit.
- Challenge creation also uses the fence so closure or rotation cannot leave a
  newly inserted stale challenge after its cleanup.
- Account information combines positively projected identity with UserProfiles
  fields. Username/email updates remain on AccountList; phone/bio/DOB update only
  UserProfiles, atomically when edited together.
- Avatar bytes and MIME types use UserAvatars. Public avatar URLs are derived from
  account IDs; friend lists batch avatar presence lookups. Notification contact
  email comes from identity, and phone comes from UserProfiles.
- Event/store/history responses batch-load ordered photo metadata from EventPhotos
  or StorePhotos. Cover and individual image endpoints read those collections.
  Original embedded/legacy photos are never used as a fallback.
- Creation writes main metadata and photo records within the owner-fenced
  transaction. Event photo edits resolve retained IDs against the same event,
  validate the complete desired collection, and replace the ordered records in
  the transaction while retaining existing IDs and timestamps. Omitted photos
  preserve the collection; an explicit empty array clears only new photo records.
- The five-photo/JPEG/size rules, public owner checks, event expiry filtering,
  booking-history privacy, and independent Interested/Attending flags remain.

At the end of the code cutover, original duplicated fields remained physically
stored and hidden by the schemas. That operation did not perform field removal,
original-image rewrites, or collection deletion. Normal identity/event/store
edits continued updating their main collections. No mobile changes were needed.
The later approved physical cleanup has its own backup and integrity report.

Historical copy/refresh writes were initially disabled at cutover. After physical
cleanup, every historical copier mode is retired by COPY_PHASE_COMPLETE. Current
split collections remain authoritative; missing or stale original fields must
never reconstruct or overwrite passwords, profiles, MFA, or photos.

## Created files

| File | Summary |
| --- | --- |
| [accountReadService.js](../backend/src/services/accountReadService.js) | Safe identity/profile DTOs and batched avatar URLs. |
| [accountState.js](../backend/src/services/accountState.js) | Shared active-account/security-version checks without circular service imports. |
| [photoCollectionService.js](../backend/src/services/photoCollectionService.js) | Batched metadata, image reads, and transactional ordered photo replacement. |
| [split-collection-cutover.md](split-collection-cutover.md) | This cutover and file inventory. |

## Modified files

| File | Summary |
| --- | --- |
| [authService.js](../backend/src/services/authService.js) | Transactional signup, new credential/lockout reads/writes, split profile validation and saving. |
| [accountSecurity.js](../backend/src/services/accountSecurity.js) | Authoritative security state and fenced MFA/password/closure/challenge operations. |
| [sessionService.js](../backend/src/services/sessionService.js) | Uses split account/security state for session validity. |
| [activeAccountWrite.js](../backend/src/services/activeAccountWrite.js) | Locks identities before checking authoritative security version. |
| [userService.js](../backend/src/services/userService.js) | Split avatar persistence and safe combined user responses. |
| [friendService.js](../backend/src/services/friendService.js) | Uses batched UserAvatars URL lookups. |
| [settingsService.js](../backend/src/services/settingsService.js) | Reads notification phone contact from UserProfiles. |
| [eventService.js](../backend/src/services/eventService.js) | Collection-backed event media and atomic event/photo writes. |
| [eventSelectionService.js](../backend/src/services/eventSelectionService.js) | Adds new-collection photo metadata to private history. |
| [storeService.js](../backend/src/services/storeService.js) | Collection-backed store media and atomic publishing. |
| [eventData.js](../backend/src/services/eventData.js) | Accepts photo input separately from main fields; serializes explicit photo results. |
| [photoData.js](../backend/src/services/photoData.js) | Collection-only retention/serialization with no legacy fallback. |
| [authController.js](../backend/src/controllers/authController.js) | Passes plain API base URLs to combined-profile and MFA services. |
| [userController.js](../backend/src/controllers/userController.js) | Passes API base URL for combined profile/avatar responses. |
| [friendController.js](../backend/src/controllers/friendController.js) | Passes API base URL for friend avatar URLs. |
| [User.js](../backend/src/models/User.js) | Keeps archived split fields hidden and without defaults; identity-only signup is valid. |
| [Event.js](../backend/src/models/Event.js) | Keeps old media fields hidden without defaults. |
| [Store.js](../backend/src/models/Store.js) | Keeps old media fields hidden without defaults. |
| [AccountSecurity.js](../backend/src/models/AccountSecurity.js) | Updates model status comment; collection/index provisioning stays explicit. |
| [UserProfile.js](../backend/src/models/UserProfile.js) | Updates model status comment. |
| [UserAvatar.js](../backend/src/models/UserAvatar.js) | Updates model status comment. |
| [EventPhoto.js](../backend/src/models/EventPhoto.js) | Updates active-storage/index comments. |
| [StorePhoto.js](../backend/src/models/StorePhoto.js) | Updates active-storage/index comments. |
| [duplicateSplitCollections.js](../backend/scripts/duplicateSplitCollections.js) | Adds explicit destination-only reconciliation, backup permission fix, and disables writes after cutover. |
| [staged-database-models.md](staged-database-models.md) | Links historical staging to current cutover status. |
| [split-collection-copy.md](split-collection-copy.md) | Links historical copy to current authority and disabled-write status. |
| [stores-and-photos.md](stores-and-photos.md) | Links original feature description to separate collection storage. |

## Verification boundary

The authorized data reconciliation and full copy/original integrity checks ran
successfully. Code review used source and diffs only. No application tests, type
checks, syntax execution, app launches, or HTTP functionality calls were run.
Runtime behavior, including photo reordering transactions, is left for the user's
manual verification. Restart the backend and reload the mobile app before
checking signup/login/MFA, account/profile/avatar updates, notification contacts,
event create/edit/gallery/history, and store creation/detail photos.
