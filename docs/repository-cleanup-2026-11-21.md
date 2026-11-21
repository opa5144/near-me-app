# Repository cleanup — November 21, 2026

The app no longer needs the local source-photo collections or the one-time scripts
used to populate and repair existing Atlas records. The previous deletion of
`backend/scripts/`, its fixtures, and `backend/NearMeEventSamplePhotos/` was retained.
This cleanup removes the unused source modules that those scripts left behind.

## Removed files

| File | Reason |
| --- | --- |
| `backend/src/services/demoCommunityService.js` | One-time community-account/event/selection population; no remaining importer. |
| `backend/src/services/storeHistoryPopulationService.js` | One-time store/history import; no importer and its fixtures were already deleted. |
| `backend/src/services/notifications/repairService.js` | Retired administrative notification correction; not used by the live worker or inbox. |
| `backend/src/services/notifications/socialBackfillService.js` | One-time pending-friend/invitation notification backfill; no runtime importer. |
| `backend/test/events.test.cjs` | Obsolete fixture/seeder test referencing deleted files and an old inline-image schema. |
| `mobile/assets/splash-icon.png` | Unreferenced source image; neither Expo configuration nor native resources use it. |

The backend's generic `npm test` entry was retained; the retired test was not run
or replaced with a new suite.

## Retained resources

- The five configured app-icon/adaptive-icon/favicon source assets and all 30
  referenced native Android icon/splash resources.
- Event/store images stored in MongoDB's `EventPhotos` and `StorePhotos` collections.
- All live routes, controllers, services, models, middleware, provider adapters,
  event-lifecycle processing, and notification workers.
- Private ignored snapshots and Git recovery backups.

No database records, image documents, notification settings, or external delivery
providers were changed. The retired population and repair services were not part
of the app's dependency graph from `backend/src/index.js`.

## Git push cleanup

The three unpublished commits were recreated with the same messages, original
author/committer metadata, and changes, except for these accidental installer
paths:

- `backend/NearMeEventSamplePhotos/GlobalProtect64-6.3.3-c1016.msi`
- `backend/NearMeEventSamplePhotos/microsoft-jdk-25.0.5.0.2-windows-x64.exe`
- `backend/NearMeEventSamplePhotos/vs_SSMS.exe`

All other changes, including the existing script/photo deletions and UI work, were
preserved. Before this cleanup's new file deletions, the rewritten application tree
was verified byte-for-byte against the original HEAD; only `.gitignore` then
changed to ignore `.exe` and `.msi` downloads in the old photo directory.

The outgoing branch has no installer paths or blobs over GitHub's size limit.
Shared history was not changed and nothing was pushed. A local backup branch and
verified recovery bundle preserve the original history. Use an ordinary push of
`main`; backup branches are local recovery references.

The additional obsolete-file removals and documentation annotations are left
uncommitted for review. Historical feature reports now identify their retired
administrative tools instead of presenting them as current commands.

## Verification

- All 107 remaining backend modules passed syntax checks and are reachable from
  the app entry point; no local imports are missing.
- All five configured branding source images exist; the 30 referenced Android
  icon/splash resources were retained.
- `npx.cmd --no-install tsc --noEmit` passed.
- `git diff --check` passed.
- No functional tests, server/app startup, provider sends, or database access
  were performed.
