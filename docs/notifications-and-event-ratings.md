# Notifications frontend and event ratings

This phase connects the app to the notification backend and adds attendee ratings. Provider account setup and live email/SMS/push delivery remain on hold. No provider credentials, native push packages, real environment settings, or existing database records were changed by this phase.

## User flows

- Open the notification inbox from the dashboard bell, Settings, or the profile's existing inbox. It loads real notification records, supports pagination and read/unread actions, and shows the shared unread count.
- Open an event notification to view its saved event ID. Open a rating reminder to rate the event. Only known action names and valid database IDs are used for navigation.
- Notification Settings loads/saves the four channel choices and preferences for all ten implemented notification types. Existing contact details and older preferences are retained. External channels remain labelled inactive while provider setup is on hold.
- Follow or unfollow another user from their public profile. An organizer is an ordinary user hosting an event; following is independent of friendship.
- After an event ends, an attending user can choose or change one rating. The form is available in ended-event details, attended booking history, and the rating screen opened by a notification.
- The event owner can view all five rating counts on the ended event's host details page and refresh them. Individual reviewers are not exposed in the summary.

## Rating rules and storage

The five options are **😞 Terrible**, **🙁 Poor**, **😐 Okay**, **🙂 Good**, and **🤩 Excellent**. These are fixed choices, not written reviews.

`EventRating` stores `userId`, `eventId`, `score` (integer 1–5), and timestamps in `eventRatings`. A unique `{userId, eventId}` index ensures one editable vote per user/event. Changing a vote updates the same record; totals are calculated from stored ratings, not incremented counters.

The backend requires an active user and host, an ended event that has not been cancelled, and the user's existing `attending` flag. Interested alone does not qualify, and hosts cannot rate their own events. This uses registration as eligibility; there is no physical attendance/check-in verification. If an ended event is moved into the future, the saved rating is retained and editing is disabled until the event ends again.

The host summary is owner-only and includes every option, even when its count is zero. Closed accounts' rating records are retained, while active accounts contribute to the displayed counts, consistently with existing audience totals.

The rating reminder still becomes due one hour after event end. It is suppressed if a rating already exists. New reminders carry a `RATE_EVENT` action; the frontend also recognizes older rating reminders whose action was null.

## Backend workflow and endpoints

`routes/events.js` → `eventRatingController.js` → `eventRatingService.js` → Mongoose models.

Controllers own HTTP responses. The service validates input and eligibility and uses the existing account-fenced transaction for writes. Services do not receive Express request/response objects. Rating writes and host edits share the account fence, so eligibility is checked against the current transactional state.

| Endpoint | Response / input |
| --- | --- |
| `GET /api/events/:id/rating` | `{eventId, rating, eligibility: {canRate, reason}, scores}` for the current user. |
| `PUT /api/events/:id/rating` | Body `{ "score": 1 }` through `{ "score": 5 }`; creates or replaces the caller's choice and returns the current rating response. |
| `GET /api/events/:id/ratings/summary` | Ended-event owner only: `{eventId, totalRatings, averageScore, counts}`. |

The frontend notification API uses the existing authenticated `/api/notifications` endpoints. Shared notification state mounts inside the authenticated navigator, refreshes on inbox focus and app resume, polls every 30 seconds while active, and is discarded on logout/session expiry. Expanded inbox pages keep their position during polling; pull to refresh retrieves new first-page records. Late requests from a previous screen/account do not become the new account's state.

## Provider work still on hold

The app can store external channel choices, but that does not activate delivery. Resend/Twilio/Expo accounts, verified sender details, Expo/Firebase/Apple push credentials as applicable, native push permissions, device-token lifecycle, and notification handling outside the running app remain a later phase. No sample project ID or token is substituted for real configuration.

## Verification

Only source and diff review was performed. Per the user's request, no tests, typechecks, lint, syntax checks, server/app starts, API functionality calls, provider sends, or database queries/writes were run. Restart the backend to load the new routes and initialize the rating collection/index, then manually exercise the app flows.

## Files created in this phase

| File | Responsibility |
| --- | --- |
| `backend/src/constants/eventRatings.js` | Authoritative five score/emoji/label choices. |
| `backend/src/models/EventRating.js` | Rating collection, validation, and uniqueness. |
| `backend/src/services/eventRatingService.js` | Eligibility, own rating reads/writes, host aggregation. |
| `backend/src/controllers/eventRatingController.js` | Rating HTTP responses and safe errors. |
| `mobile/src/api/notifications.ts` | Typed inbox/preferences API and safe action interpretation. |
| `mobile/src/context/NotificationsContext.tsx` | Session-scoped inbox, pagination, unread state, refresh and mutations. |
| `mobile/src/components/NotificationInbox.tsx` | Shared real inbox UI and actions. |
| `mobile/src/components/NotificationBell.tsx` | Shared unread indicator and inbox entry. |
| `mobile/src/screens/settings/NotificationInboxScreen.tsx` | Full inbox page. |
| `mobile/src/api/organizerFollows.ts` | User follow/unfollow API. |
| `mobile/src/api/eventRatings.ts` | Typed rating API. |
| `mobile/src/components/EventRatingForm.tsx` | Shared attendee rating form. |
| `mobile/src/components/EventRatingSummary.tsx` | Shared five-count host summary. |
| `mobile/src/screens/event/RateEventScreen.tsx` | Rating destination that reloads by event ID. |
| `docs/notifications-and-event-ratings.md` | Flow, rules, endpoints, limitations, and file inventory. |

## Files modified in this phase

| File | Change |
| --- | --- |
| `backend/src/routes/events.js` | Authenticated rating endpoints. |
| `backend/src/workers/notificationWorker.js` | Initialize the rating model before queued notification work. |
| `backend/src/services/notifications/policyService.js` | Suppress ineligible/already-rated rating prompts. |
| `backend/src/services/notifications/templates.js` | Add the rating navigation action. |
| `mobile/src/navigation/AppNavigator.tsx` | Mount notification state and inbox/rating routes; connect navigation callbacks. |
| `mobile/src/data/events.ts` | Type event cancellation/deadline fields already returned by the backend. |
| `mobile/src/api/settings.ts` | Type the extended notification settings response. |
| `mobile/src/screens/event/HomeScreen.tsx` | Dashboard notification bell. |
| `mobile/src/screens/event/EventDetailsScreen.tsx` | Ended-event rating entry and cancelled-event presentation. |
| `mobile/src/screens/host/EventHostDetailsScreen.tsx` | Ended-event host rating counts and refresh. |
| `mobile/src/screens/settings/BookingHistoryDetailsScreen.tsx` | Rating form for eligible attended history entries. |
| `mobile/src/screens/settings/NotificationsScreen.tsx` | Channel/type preferences and provider-hold messaging. |
| `mobile/src/screens/settings/UserProfileScreen.tsx` | Replace notification samples with the shared real inbox. |
| `mobile/src/screens/settings/PublicProfileScreen.tsx` | Independent Follow/Unfollow actions with saved state and errors. |
| `mobile/src/screens/settings/SettingsScreen.tsx` | Inbox entry/unread count, preference entry, working sign-out. |
| `docs/general-user-notifications.md` | Point to this phase and current rating/frontend behavior. |

Previously deleted administrative scripts remain untouched. The earlier notification backend files retain their existing implementation except for the specific changes listed above.
