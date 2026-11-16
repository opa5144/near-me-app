# Stores, booking history, and social notifications

This update aligns all nine store categories, adds five normal store records per category, populates attended booking history for Patrick, Demi, and Joshua, and connects actual pending friend requests to the notification inbox. Event invitations retain their existing notification and acceptance flow.

## Stores and booking history

- Store categories are **Music, Dance, Food, Film, Workshop, Art, Clothing, Entertainment, and Retail**. Event categories retain their existing six choices; unsupported store-only categories no longer leak into event creation validation.
- The final preview plans **45 new stores**, with five in each category and 15 owned by each of the three pinned accounts. Each new store has two ordered photos, its first as cover, an address, and one opening/closing interval for each open weekday. The planned photo count is **90**.
- These are normal app-managed records. Their names and weekly trading hours are app-configured at previously verified addresses. Category photographs illustrate the content; they are not claimed to depict those individual businesses. The manifests record this distinction and image provenance.
- Each pinned account reaches **at least ten attended, noncancelled past events**, using existing events owned by other active accounts. Existing attendance, interest, ratings, and event metadata are preserved. New historical links exclude legacy `[HistoryDemo]`/`[Test]` entries.
- `EventSelections.historyRecordedAt` records when historical attendance was added. Existing `registeredAt` values are retained; new historical links do not invent a past in-app registration, enqueue old registration confirmations/reminders, or manufacture ratings. Booking History already reads the resulting saved attendance and ended event records.

## Friend requests and event invitations

`FRIEND_REQUEST` notifications reference the real Friendship ID and request generation. They have no fabricated event ID. Normal sends/resends commit the pending request and durable notification job in the same account-fenced transaction. Repeated requests/backfills reuse the canonical key. Crossed requests that become accepted, and explicit accept/decline responses, mark associated alerts read.

The recipient-only `GET /api/friends/request/:requestId` returns safe request/sender details and whether a response is allowed. `PATCH /api/friends/request/:requestId` retains its accept/reject behavior and optionally verifies `requestVersion` so an old card cannot answer a later resend. Blocked, closed, resolved, and superseded requests are checked again before notification materialization or delivery.

The mobile inbox displays the sender and an inline accept/decline card. Tapping its action opens a dedicated request screen. Per-type channel choices and the social email/SMS preferences apply. Responding refreshes friendship counts and the inbox.

The final social preview contains **three eligible pending requests from Demi**: to Joshua, Patrick, and `charliemock`. Backfill uses those existing records; it creates no friendship or event invitation. The preview contains **zero pending event invitations**. Future actual invitations continue through the existing `EVENT_INVITE` outbox, preference checks, sender-named notification, and recipient-owned accept/decline flow.

Backfill adds permitted in-app alerts only. Existing read states remain unchanged; newly inserted alerts start unread, and responding marks their linked alerts read. Email/SMS/push provider setup remains on hold; the administrative command starts no worker or external provider delivery.

## Administrative command and snapshots

Run from `backend`. The default is a read-only preview:

```powershell
node scripts/populateStoresHistoryAndSocial.js
node scripts/populateStoresHistoryAndSocial.js --apply
```

Use `--data-only` for store/history population or `--social-only` for pending social notification backfill. Each supports preview and `--apply`; the two flags cannot be combined.

Before any apply writes, the command saves an ignored private BSON EJSON snapshot under `backend/.local-backups/` for eight collections: `StoreList`, `StorePhotos`, `EventSelections`, `friendships`, `eventinvites`, `notifications`, `notificationJobs`, and `notificationDeliveries`. It then writes a private count/result report. Account credentials and contact records are not copied into those snapshots. Stable IDs, unique indexes, and source checks make reruns reuse completed work instead of creating duplicates.

## Changed and created files

| Area | Files and responsibility |
| --- | --- |
| Store categories | [storeCategories.js](../backend/src/constants/storeCategories.js), [Store.js](../backend/src/models/Store.js), [events.ts](../mobile/src/data/events.ts), [CreateStoreScreen.tsx](../mobile/src/screens/host/CreateStoreScreen.tsx), [hostFormUtils.ts](../mobile/src/screens/host/hostFormUtils.ts): align nine store choices and retain separate event validation. |
| Store/history population | [storeHistoryPopulationService.js](../backend/src/services/storeHistoryPopulationService.js), [EventSelection.js](../backend/src/models/EventSelection.js), [populateStoresHistoryAndSocial.js](../backend/scripts/populateStoresHistoryAndSocial.js): preview/apply services, historical-record timestamp, snapshot/report coordination, and idempotent inserts. |
| Population assets | [stores.json](../backend/scripts/fixtures/store-population/stores.json), [photos.json](../backend/scripts/fixtures/store-population/photos.json), and six JPEGs in [photos/](../backend/scripts/fixtures/store-population/photos/): store content, provenance/hash manifest, and additional category images. Existing category-demo venue/media manifests are reused. |
| Friend API | [Friendship.js](../backend/src/models/Friendship.js), [friendService.js](../backend/src/services/friendService.js), [friendController.js](../backend/src/controllers/friendController.js), [friends.js](../backend/src/routes/friends.js): request generations, recipient-only reads, normal atomic writes, response checks, and alert-read updates. |
| Notification schema/settings | [notificationTypes.js](../backend/src/constants/notificationTypes.js), [Notification.js](../backend/src/models/Notification.js), [NotificationDelivery.js](../backend/src/models/NotificationDelivery.js), [NotificationSettings.js](../backend/src/models/NotificationSettings.js): friend-request type/reference, non-event notification support, and social preferences. |
| Notification services | [friendRequestService.js](../backend/src/services/notifications/friendRequestService.js), [socialBackfillService.js](../backend/src/services/notifications/socialBackfillService.js), [policyService.js](../backend/src/services/notifications/policyService.js), [jobService.js](../backend/src/services/notifications/jobService.js), [templates.js](../backend/src/services/notifications/templates.js), [preferenceService.js](../backend/src/services/notifications/preferenceService.js), [inboxService.js](../backend/src/services/notifications/inboxService.js), [repairService.js](../backend/src/services/notifications/repairService.js): canonical jobs/backfill, pending-source eligibility, safe content/actions, preferences, DTOs, and preservation of genuine social history during later repairs. |
| Worker/provider routing | [notificationWorker.js](../backend/src/workers/notificationWorker.js), [expoPush.js](../backend/src/providers/notifications/expoPush.js): initialize the Friendship model and carry request routing data when push providers are eventually enabled. |
| Mobile API/settings | [friends.ts](../mobile/src/api/friends.ts), [notifications.ts](../mobile/src/api/notifications.ts), [settings.ts](../mobile/src/api/settings.ts), [NotificationsScreen.tsx](../mobile/src/screens/settings/NotificationsScreen.tsx): safe request DTO/versioned responses, distinct request actions, and social/per-channel controls. |
| Mobile inbox/navigation | [FriendRequestCard.tsx](../mobile/src/components/FriendRequestCard.tsx), [FriendRequestScreen.tsx](../mobile/src/screens/settings/FriendRequestScreen.tsx), [NotificationInbox.tsx](../mobile/src/components/NotificationInbox.tsx), [NotificationInboxScreen.tsx](../mobile/src/screens/settings/NotificationInboxScreen.tsx), [UserProfileScreen.tsx](../mobile/src/screens/settings/UserProfileScreen.tsx), [AppNavigator.tsx](../mobile/src/navigation/AppNavigator.tsx): shared request actions, retries/race guards, and routing from either inbox while retaining event/rating/invitation actions. |
| Documentation | [This file](stores-booking-history-social-notifications.md): scope, file inventory, commands, and verification/application record. |

## Verification and application results

- Mobile TypeScript compilation passed.
- Android JavaScript/Hermes export passed: **1,376 modules and 54 assets**.
- Modified backend sources pass syntax checks. The permitted limited backend startup/read-only API check passed.
- Manual UI tests and a functional test suite were not run, as requested.
- The authorized apply completed on November 15, 2026. The subsequent read-only preview proposes **zero** additional stores, photos, attendance links, or social alerts.
- The integrity audit reports no duplicate keys/friendship pairs, missing profile/security records, legacy inline fields, or orphaned event owners.

| Applied change | Result |
| --- | --- |
| Stores added | 45; five per category, 15 per named owner |
| Store photos added | 90; two per new store |
| Store collection after apply | 47 stores and 91 photos, including the two pre-existing stores and their media |
| Historical attendances recorded | 30; ten each for `hollow12` (Patrick), `demiberry` (Demi), and `Joshua` |
| Event selection rows after apply | 2,423; one existing interest record was preserved/upgraded, and 29 new rows were inserted |
| Existing ratings | 416, unchanged |
| Friend-request notifications added | Three, for actual pending Demi requests to Joshua, Patrick, and `charliemock` |
| Joshua's Demi-request alert | One linked to Friendship `6af801cb096a3a7fb2123162`, generation one |
| Pending event invitations to backfill | Zero; normal future event-invitation notifications remain connected |
| Friendships / invitations created by the backfill | Zero |
| External deliveries created/sent by this operation | Zero |

Existing event schedules, stores/media, credentials, ratings, and unrelated notification read states were preserved. Historical attendance records are available to the existing Booking History query; no previous app-registration timestamp was manufactured for the import. Read state changes normally when a user opens or responds to an alert.

Restart the backend and reload the mobile app to load the new routes, worker logic, and friend-request UI. Pull to refresh store lists, Booking History, and the notification inbox as needed.

No commit is created by this work.
