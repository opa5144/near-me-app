# Pull and merge resolution — November 22, 2026

The checkout already had a pull paused in a merge. Local commit `29b5c68`
(`QR Codes`) and incoming commits `d2600c9` (store contacts and UI consistency)
and `3dafc36` (saved itineraries) shared base `e97e586`. Fetching origin confirmed
that `3dafc36` was still the latest remote commit. The resolution keeps both
parents and their functionality; it does not rewrite either history.

Before edits, the working files, index, conflict stages, merge metadata, and a
verified Git recovery bundle were saved privately under
`backend/.local-backups/before-pull-resolution-2026-11-22T23-10-04-038Z/`.

## Conflict and integration fixes

| File | Resolution |
| --- | --- |
| [EventsContext.tsx](../mobile/src/context/EventsContext.tsx) | Retain verified attendance alongside bulk RSVP and saved-itinerary actions. Preserve discovery expiration and draft/archive exclusion. Prevent bulk unregister after check-in and report busy operations accurately. Store itineraries per authenticated account, serialize storage operations, validate loaded records, and preserve records when saving/deletion fails. |
| [ItineraryScreen.tsx](../mobile/src/screens/event/ItineraryScreen.tsx) | Retain naming, saving, selecting, expanding, and deleting itineraries. Reconcile saved snapshots with current event details and remove unavailable events. Keep Reset View, compact spacing, and one date/time display per shared event card. Add storage loading/retry feedback. |
| [CreateStoreScreen.tsx](../mobile/src/screens/host/CreateStoreScreen.tsx) | Retain incoming optional contact inputs; validate each on exit and display its error beneath the input. |
| [hostFormUtils.ts](../mobile/src/screens/host/hostFormUtils.ts) | Match the new contact fields to backend limits and email/website rules, and map server errors to their respective controls. |

Existing unscoped device itinerary data is left untouched. Its owner cannot be
determined, so it is not automatically exposed to the next account signing in.
New saved itineraries use an account-specific device storage key. This remains
device storage, as implemented by the incoming feature, rather than Atlas storage.

## Incoming changes preserved

- Store phone, email, and website fields in
  [Store.js](../backend/src/models/Store.js),
  [storeService.js](../backend/src/services/storeService.js),
  [stores.ts](../mobile/src/api/stores.ts), and
  [StoreDetailsScreen.tsx](../mobile/src/screens/host/StoreDetailsScreen.tsx).
- Consistent navigation/close controls in PhotoCollection, EventDetailsScreen,
  CreateEventScreen, CreateStoreScreen, BookingHistoryScreen,
  NotificationInboxScreen, NotificationsScreen, PreferencesScreen, and SecurityScreen.
- AsyncStorage dependency and lockfile entries in
  [package.json](../mobile/package.json) and
  [package-lock.json](../mobile/package-lock.json). Existing Expo Camera remains.

QR ticket credentials, endpoints, host scanning, check-in restrictions, rating
eligibility, and ticket history remain intact. No database records or provider
configuration were changed during the merge.

## Verification

- TypeScript compilation passed.
- Changed backend JavaScript passed syntax checks.
- Android debug APK compiled successfully for the x86_64 emulator architecture,
  with AsyncStorage and the existing QR camera module included.
- Android Metro/Hermes export passed: 1,397 modules and 54 assets.
- Independent source review found no remaining integration blockers.
- No functional tests, app launches, or database operations were performed.

Rebuild/install the native app from `mobile` with `npm run android` before manual
review, because an older installed app does not contain the new storage module.
