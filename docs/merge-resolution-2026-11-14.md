# Merge resolution: November 14, 2026

This work combines the incoming friendship, event-invitation, and calendar features with the existing notifications, organizer follows, event ratings, cancellation, and account-security behavior. It addresses the findings in the [original pull review](pull-review-2026-11-14.md) without choosing either branch wholesale.

The backend retains the established workflow: routes attach middleware, controllers handle HTTP, services enforce business rules, and models persist data. Services receive plain values rather than Express request/response objects.

## Event access and friendship

Public event reads can remain anonymous. When a token is supplied, optional authentication validates it and supplies the actual viewer ID. Friend-attendance enrichment uses that event's attending selections, accepted friendships, active accounts, and the separate avatar collection. Friendship request/response writes use the shared account-fenced transaction, preserve blocked relationships, and return meaningful HTTP errors. A reverse pending request can become accepted, and the UI uses the returned state rather than always showing a sent request.

| File | Status in this work | Change |
| --- | --- | --- |
| [backend/src/middleware/optionalAuth.js](../backend/src/middleware/optionalAuth.js) | Created | Optional authentication for public event reads; supplied invalid credentials still fail. |
| [backend/src/controllers/eventController.js](../backend/src/controllers/eventController.js) | Resolved/modified | Thin HTTP handling using the established auth context; preserves cancellation and event responses. |
| [backend/src/routes/events.js](../backend/src/routes/events.js) | Resolved/modified | Combines rating, cancellation, invite, and event routes with their middleware. |
| [backend/src/services/eventService.js](../backend/src/services/eventService.js) | Modified | Viewer-aware list/detail enrichment and correct authenticated hosted-event reads. |
| [backend/src/services/friendAttendance.js](../backend/src/services/friendAttendance.js) | Incoming/modified | Actual event attendance and canonical avatars, filtered to active accepted friends. |
| [backend/src/controllers/friendController.js](../backend/src/controllers/friendController.js) | Modified | Safe service-error responses and the established authentication contract. |
| [backend/src/services/friendService.js](../backend/src/services/friendService.js) | Modified | Account fencing, active-account validation, blocked-state precedence, idempotent requests, and split-avatar reads. |
| [backend/src/services/friendshipAccess.js](../backend/src/services/friendshipAccess.js) | Created | Shared accepted-friend check in both directions; any block takes precedence. |
| [backend/src/routes/friends.js](../backend/src/routes/friends.js) | Incoming/preserved | Incoming friend endpoints retained. |
| [mobile/src/api/friends.ts](../mobile/src/api/friends.ts) | Incoming/modified | Typed relationship responses and mutation calls. |
| [mobile/src/components/FriendActionButton.tsx](../mobile/src/components/FriendActionButton.tsx) | Incoming/modified | Uses server-returned relationship state, prevents repeated submissions, and displays failures. |
| [mobile/src/components/AcceptRequestCard.tsx](../mobile/src/components/AcceptRequestCard.tsx) | Incoming/modified | Responds with the Friendship request ID, with locking and visible errors. |
| [mobile/src/components/FriendAvatarStack.tsx](../mobile/src/components/FriendAvatarStack.tsx) | Incoming/preserved | Incoming avatar-stack presentation retained; callers supply actual event attendees. |
| [mobile/src/screens/settings/PublicProfileScreen.tsx](../mobile/src/screens/settings/PublicProfileScreen.tsx) | Resolved/modified | Typed friendship controls alongside independent Follow/Unfollow behavior. |
| [mobile/src/screens/settings/UserProfileScreen.tsx](../mobile/src/screens/settings/UserProfileScreen.tsx) | Resolved/modified | Real inbox/unread state and friend-request cards, with guarded refreshes. |

## Working event invitations and notifications

Sending an invite now calls the backend rather than an optional unwired callback. Sender, recipient, host, friendship, event state, and registration deadline are validated. The invitation and durable notification job commit together. Accepting a pending invitation updates attendance through the same selection logic as ordinary registration, inside the invitation-response transaction. Declining does not change attendance. Recipient-only reads/responses use current event details and split media rather than obsolete inline fields.

`EVENT_INVITE` is an eleventh notification type alongside the original ten. It observes the existing channel preferences and active-account/event policies. The inbox supports accept/decline and direct event opening. A pending-invitations panel remains available even if in-app notification delivery is disabled. Reading/responding marks related invite notifications read and prevents a delayed worker from creating another unread occurrence for an already-read invite.

| File | Status in this work | Change |
| --- | --- | --- |
| [backend/src/models/EventInvite.js](../backend/src/models/EventInvite.js) | Incoming/modified | Explicit existing `eventinvites` collection, response timestamp, recipient ordering, and unique event/sender/recipient index. |
| [backend/src/controllers/eventInviteController.js](../backend/src/controllers/eventInviteController.js) | Incoming/modified | Thin authenticated HTTP adapter for list/get/send/respond operations. |
| [backend/src/services/eventInviteService.js](../backend/src/services/eventInviteService.js) | Created | Invite validation, ownership, canonical DTOs, account-fenced writes, durable outbox, and atomic acceptance/attendance. |
| [backend/src/services/eventSelectionService.js](../backend/src/services/eventSelectionService.js) | Modified | Shares the transactional selection writer while preserving cutoff, generation, reminder, and registration-notification rules. |
| [backend/src/constants/notificationTypes.js](../backend/src/constants/notificationTypes.js) | Modified | Adds `EVENT_INVITE` without replacing the original types. |
| [backend/src/services/notifications/policyService.js](../backend/src/services/notifications/policyService.js) | Modified | Checks pending unread invite ownership, current friendship/block state, active sender, and open registration. |
| [backend/src/services/notifications/templates.js](../backend/src/services/notifications/templates.js) | Modified | Invite wording, safe invite ID payload, and event-opening action. |
| [backend/src/services/notifications/jobService.js](../backend/src/services/notifications/jobService.js) | Modified | Includes invite actor in account-fenced materialization. |
| [backend/src/workers/notificationWorker.js](../backend/src/workers/notificationWorker.js) | Modified | Initializes the invitation model before queued work. |
| [mobile/src/api/eventInvites.ts](../mobile/src/api/eventInvites.ts) | Created | Typed send/list/get/respond/read requests. |
| [mobile/src/api/notifications.ts](../mobile/src/api/notifications.ts) | Modified | Includes the invite notification type. |
| [mobile/src/components/InviteFriendsModal.tsx](../mobile/src/components/InviteFriendsModal.tsx) | Incoming/modified | Loads friends, sends real invites, and shows Invited only after success; includes retry/errors. |
| [mobile/src/components/EventInviteCard.tsx](../mobile/src/components/EventInviteCard.tsx) | Created | Loads recipient-owned invitation state, accepts/declines, and marks read before opening details. |
| [mobile/src/components/EventInvitesPanel.tsx](../mobile/src/components/EventInvitesPanel.tsx) | Created | Latest pending received invitations, including when notification delivery is disabled. |
| [mobile/src/components/NotificationInbox.tsx](../mobile/src/components/NotificationInbox.tsx) | Modified | Integrates invite actions/panel with the real inbox; focus, pull-to-refresh, retry, and responses refresh invitation state as well as affected event/selection state. |
| [mobile/src/screens/settings/NotificationsScreen.tsx](../mobile/src/screens/settings/NotificationsScreen.tsx) | Modified | Adds invite channel preferences while retaining provider-hold messaging. |
| [mobile/App.tsx](../mobile/App.tsx) | Modified | Corrects linking route names for the actual event, rating, and inbox destinations. |

## Event screens, prices, and calendar

Conflict resolution retains the notification bell, attendee rating form, ended-event host rating counts, follows, and cancellation guards alongside incoming friends/invites/calendar features. Registration cutoff disables new attendance/invites, while an existing attendee can still cancel before the event ends. Attendee avatars represent the current event's actual attending friends.

Price display preserves stored cents. Estimated revenue multiplies canonical numeric ticket prices by attendee counts in integer cents; dashboard copy no longer presents unsupported conversion claims. Calendar actions use valid full start/end instants, present the native calendar editor for the user to confirm, and fall back to a Google Calendar URL if the native editor cannot open. Calendar failures are visible to the user.

| File | Status in this work | Change |
| --- | --- | --- |
| [mobile/src/screens/event/EventDetailsScreen.tsx](../mobile/src/screens/event/EventDetailsScreen.tsx) | Resolved/modified | Preserves ratings/cancellation, adds working invitations and actual friend attendance, shared calendar/price handling, and cutoff state. |
| [mobile/src/screens/event/HomeScreen.tsx](../mobile/src/screens/event/HomeScreen.tsx) | Resolved/modified | Keeps the real notification bell and canonical ticket price formatting. |
| [mobile/src/screens/host/EventHostDetailsScreen.tsx](../mobile/src/screens/host/EventHostDetailsScreen.tsx) | Resolved/modified | Keeps five rating totals, invite/calendar actions, cutoff guards, and correct estimated revenue. |
| [mobile/src/screens/host/EventHostScreen.tsx](../mobile/src/screens/host/EventHostScreen.tsx) | Modified | Uses cents-preserving summaries and truthful dashboard labels. |
| [mobile/src/components/EventCard.tsx](../mobile/src/components/EventCard.tsx) | Modified | Shared precise price display for event tiles. |
| [mobile/src/components/PriceInputField.tsx](../mobile/src/components/PriceInputField.tsx) | Modified | Accepts prices with up to two decimal places. |
| [mobile/src/utils/eventPrice.ts](../mobile/src/utils/eventPrice.ts) | Created | Shared canonical amount, currency display, and integer-cent revenue helpers. |
| [mobile/src/utils/eventCalendar.ts](../mobile/src/utils/eventCalendar.ts) | Created | Shared native editor and full-date web fallback with safe visible errors. |
| [mobile/src/data/events.ts](../mobile/src/data/events.ts) | Modified | Types the server's actual friend-attendance results. |

## Mobile compilation and native compatibility

The unused truncated HTML-style image uploader prevented TypeScript compilation. It now uses the app's native photo picker and reports real upload results only when an upload callback is supplied. Existing photo forms retain their five-photo default; the single-photo wrapper supplies a lower limit.

| File | Status in this work | Change |
| --- | --- | --- |
| [mobile/src/components/ImageUploader.tsx](../mobile/src/components/ImageUploader.tsx) | Modified | Valid native single-photo wrapper; removes incomplete browser-only markup and fake success. |
| [mobile/src/components/PhotoPickerField.tsx](../mobile/src/components/PhotoPickerField.tsx) | Modified | Optional bounded photo limit, defaulting to five. |
| [mobile/package.json](../mobile/package.json) | Incoming/preserved | Retains the calendar dependency. |
| [mobile/package-lock.json](../mobile/package-lock.json) | Incoming/preserved | Retains the resolved dependency lock; local dependencies installed. |
| [mobile/app.json](../mobile/app.json) | Incoming/preserved | Retains incoming native plugin configuration. |
| [mobile/android/gradle/wrapper/gradle-wrapper.properties](../mobile/android/gradle/wrapper/gradle-wrapper.properties) | Modified | Gradle 9.4.1 for the installed Android Gradle plugin. |
| [mobile/android/gradle.properties](../mobile/android/gradle.properties) | Modified | Expo/RN compatibility flags for Android Gradle plugin 9 Kotlin and DSL behavior. |
| [mobile/android/app/build.gradle](../mobile/android/app/build.gradle) | Modified | Uses the supported optimizing default ProGuard configuration and shortens generated C++ object paths for Windows Ninja. |
| [mobile/android/build.gradle](../mobile/android/build.gradle) | Modified | Explicitly generates WatermelonDB's required `BuildConfig.DEBUG` class for the library module. |
| [mobile/android/.gitignore](../mobile/android/.gitignore) | Modified | Excludes generated Kotlin build-session artifacts. |

The native Android **x86_64 debug APK build passed** (`:app:assembleDebug`, 283 tasks). Its output is `mobile/android/app/build/outputs/apk/debug/app-debug.apk`. The build installed the missing SDK Build-Tools 37, NDK 27.1.12297006, and CMake 3.22.1 using already-accepted local licenses. An emulator/app launch and other CPU architectures were not exercised.

## Actual MongoDB records and safe utilities

The audit found no legacy inline fields, duplicate relationship keys, or orphaned event hosts requiring deletion. Three old demo identities (`alicetest`, `bobdemo`, `charliemock`) lacked their split profile/security records. The approved repair inserted **three `UserProfiles` records and three `AccountSecurity` records**, using empty optional profile defaults and discarded random password hashes. It did not reset any existing credentials or make those demo accounts sign-in-able. Existing documents were preserved; only account-write fence counters were advanced during the transactional repair. A private repair manifest was saved under `backend/.local-backups`.

**No original records were deleted.** The original approved **30 in-app test notifications** remain: ten each for Patrick (`hollow12`), Joshua (`Joshua`), and Demi (`demiberry`). Their event links remain real; the seed does not manufacture attendance or bypass rating eligibility. The seed intentionally retains its original ten-type scope rather than adding friendship-dependent invite fixtures.

The incoming friend fixture scripts no longer reassign arbitrary event hosts or delete demo users. They preview by default, require an explicit owner and `--apply` to write, track newly created fixture relationships in a manifest, and only remove unchanged manifest-owned relationships. Existing accounts and their data are retained. These fixture utilities were not executed as part of the merge repair.

| File | Status in this work | Change |
| --- | --- | --- |
| [backend/scripts/auditCurrentData.js](../backend/scripts/auditCurrentData.js) | Created | Read-only collection counts and integrity audit without exposing secrets/contact data. |
| [backend/scripts/repairDemoAccountLinks.js](../backend/scripts/repairDemoAccountLinks.js) | Created/executed with approval | Inserts only verified missing split records for the three known demo identities; records a private manifest. |
| [backend/scripts/friendFixtureUtils.js](../backend/scripts/friendFixtureUtils.js) | Created | Shared explicit-owner validation, safe fixture provisioning, and manifest helpers. |
| [backend/scripts/seedFakeFriends.js](../backend/scripts/seedFakeFriends.js) | Incoming/modified | Preview-first, account-fenced fixture creation; preserves event ownership and existing relationships. |
| [backend/scripts/removeFakeFriends.js](../backend/scripts/removeFakeFriends.js) | Incoming/modified | Removes only unchanged manifest-owned fixture relationships; retains accounts and their records. |
| [backend/scripts/seedNotificationInboxes.js](../backend/scripts/seedNotificationInboxes.js) | Created in approved seed task/modified | Original ten-type, three-user, in-app-only idempotent test import; excludes `EVENT_INVITE`. |
| [backend/scripts/checkStartup.js](../backend/scripts/checkStartup.js) | Created | Explicitly approved limited startup check with workers/external delivery disabled and read-only API requests. |

## Verification and boundaries

Completed checks:

- Backend source and administrative scripts pass `node --check`.
- Mobile TypeScript passes `npx.cmd --no-install tsc --noEmit`.
- Android JavaScript/Hermes export succeeds (1,371 modules, 54 assets).
- The approved backend startup check connects to Atlas, serves `GET /api/events` with HTTP 200 (62 visible events), and rejects an unauthenticated invitation-list request with HTTP 401. Workers and provider delivery are disabled during this check.
- The post-repair read-only audit confirms 13 accounts, 13 profiles, and 13 security records, with no missing profile/security links, legacy inline fields, duplicate keys/friendship pairs, or orphaned event hosts. It still finds 79 events, 138 event photos, 17 event selections, five friendships, and the original 30 test notifications.
- Native Android x86_64 debug APK assembly succeeds after the Gradle, WatermelonDB, ProGuard, and Windows C++ path fixes.
- All seven merge conflicts are resolved and the reviewed source/supporting files are staged. No conflict markers remain in backend/mobile source. The staged patch passes Git's whitespace check.

- The permitted runtime check is limited to starting the backend and making read-only API requests with workers/external delivery disabled. It does not authorize a full functional test suite or API mutation tests.
- Actual administrative database changes are the separately approved missing-record repair and earlier test-notification import described above.
- Provider setup, live email/SMS/push sends, native push permissions/token registration, and external provider accounts remain on hold. Real `.env` files and credentials were not modified.
- The native calendar editor requires the user to confirm saving. No calendar event was saved by the implementation work.
- No commit was created. Git retains the merge in progress with its conflicts resolved, ready for review/commit.

The Android compatibility settings follow the installed Expo/RN toolchain and Android's documented [built-in Kotlin opt-out](https://developer.android.com/build/migrate-to-built-in-kotlin) and [library build features](https://developer.android.com/reference/tools/gradle-api/9.4/com/android/build/api/dsl/BuildFeatures). [CMake object-path hashing](https://cmake.org/cmake/help/latest/variable/CMAKE_OBJECT_PATH_MAX.html) avoids the observed Windows Ninja path-length failure. The Kotlin/legacy DSL flags are compatibility settings for AGP 9 and will need review before a future AGP 10 upgrade. Existing native configuration was preserved.

## Running locally

Start the backend in one terminal:

```powershell
cd backend
npm start
```

Start an Android emulator in Android Studio, then use a second terminal from the repository root. If Java/Android SDK environment variables are not configured in that terminal, the installed Android Studio JBR and standard SDK location can be selected for that session:

```powershell
cd mobile
$env:JAVA_HOME = 'C:\Program Files\Android\Android Studio\jbr'
$env:ANDROID_HOME = Join-Path $env:LOCALAPPDATA 'Android\Sdk'
npm run android
```

This builds/installs the development app and starts Metro. For an already-installed matching development build, use `npm start` in `mobile` and open that app in the emulator. Manual sign-in, invitation, notification, calendar, and rating checks remain with the user; this task did not run those flows.

## Documentation updated

- [This resolution and file inventory](merge-resolution-2026-11-14.md).
- [Original pull review](pull-review-2026-11-14.md): keeps the historical findings and links to the resolution.
- [General-user notification backend](general-user-notifications.md): adds invitation rules, endpoints, and preference behavior.
- [Notifications frontend and ratings](notifications-and-event-ratings.md): records the invitation extension and distinguishes original-phase verification from later merge checks.
