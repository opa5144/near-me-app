# QR tickets and verified attendance

Implemented November 22, 2026. Event hosts choose **Use QR tickets** when creating
an event. Omitted values default to false. Existing events initially kept their
ordinary registration behavior; selected upcoming events can receive tickets
through the controlled administrative rollout described below.

| Setting | Entry | Rating and Attended history eligibility |
| --- | --- | --- |
| Tickets on | Host scans a QR or enters the attendee's five-character code. | Registered and host-verified; ratings become available after the event ends. |
| Tickets off | No check-in is required. | Existing Attending registration after the event ends. |

Interested alone does not grant a ticket or a rating. Hosts cannot rate their own
events. Cancelled, archived, and draft events cannot accept check-ins or ratings.
Ordinary app edits cannot change the ticket mode after the first registration,
including a subsequently cancelled registration, to preserve issued credentials
and attendance rules.
Drafts and events without registration history may change the setting. A new
occurrence created from a completed event can choose its mode independently.

## Attendee and host flows

Registration and invitation acceptance share one writer. For a ticketed event,
that transaction also creates its entry ticket. Before check-in, cancelling a
registration revokes the old ticket; registering again creates a new registration
generation with different credentials. Old codes cannot check in the new generation.

Attendees open tickets through the profile's **Tickets** shortcut or **View ticket**
on event details. An authenticated owner-only request also issues a missing ticket
for an eligible existing registration. The owner sees the event, QR image,
five-character code, check-in window, and current ticket state. A visible ticket
refreshes every 15 seconds while the app is active, so another device's host scan
appears without reopening the screen. Credentials stay in the private ticket
modal, not public event caches or navigation parameters.

On their event detail screen, the host has a top-right **Scan QR** button and a
checked-in/registered count. Its overlay offers **Camera** and **Enter code**.
Camera access is requested only when selected; denying it leaves manual entry
available. The camera pauses after one scan and while the app is in the background.
The host sees the attendee's name/username, original timestamp, success or
already-checked-in state, and a **Next attendee** action. Errors appear below the
input or camera preview.

The server accepts check-in from exactly one hour before `startsAt` until
`endsAt` (end exclusive). It checks the authenticated event owner, active host and
attendee, current registration, matching event and registration generation, and
the event's status and window. Attendance and ticket redemption commit in the same
account-fenced transaction. Repeated scans preserve the first timestamp and never
increase the attendance count twice. Checked-in users cannot unregister; both the
API and mobile controls enforce this.

Hosts and attendees need a backend connection for issuance/status verification and
check-in. This phase does not implement offline check-in or staff/delegate scanning.

## Collections and fields

`QrCodeList` stores one ticket per user/event/registration generation:

- `userId`, `eventId`, `selectionId`, and `registrationVersion`.
- `keyVersion`, encrypted QR credential and manual code, and keyed lookup hashes.
- `status`: active, used, or revoked; expiration is derived from the event's end.
- `expiresAt`, `usedAt`, `revokedAt`, `createdAt`, and `updatedAt`.

Unique indexes protect user/event/generation, event/manual-code lookup, and QR
lookup identities. The QR contains a versioned ticket ID plus a random 32-byte
credential. The separate five-character uppercase code uses an unambiguous
alphanumeric alphabet, is case-insensitive, and is unique within its event.
Collisions are retried. Secret fields are excluded from ordinary model reads.

Credentials use AES-256-GCM with per-ticket authenticated context. Domain-separated
HMAC keys protect lookups, including the short manual codes. The existing backend
QR library renders the QR image when its owner opens the ticket. PNG/base64 images
are not stored in MongoDB. Ticket responses use private/no-store caching and vary
by Authorization; credentials are not logged or returned in ticket-list DTOs.

`EventSelections` gains `attended` (default false), `checkedInAt`, and `checkedInBy`.
The ordinary `attending` flag remains registration. Non-ticketed events do not
fabricate check-in timestamps or verified-attendance flags. Event responses add
`useTickets`, `ticketsModeLocked`, and an authoritative `checkedInCount`.

`EventCheckInLimits` contains host/event invalid manual-code counters. Five incorrect
codes within five minutes temporarily block manual entry for five minutes. QR
scanning remains available during that manual-code block. Only this transient
limiter state uses TTL cleanup; attendance and ticket history are retained.

All event reads use the existing cross-collection lookup, so completed events,
history, and rating prompts still work after events move to `PastEventsList`.
Cancelled/archived events invalidate entry; rescheduling a completed event creates
a new event ID and does not transfer tickets or attendance.

## Ratings, history, and notifications

Backend rating writes and owner summaries apply the same event-mode rule. Existing
votes are retained; ticketed-event totals only include verified registrations.
First check-in schedules the rating prompt transactionally. Notification policy
rechecks eligibility before showing/sending a prompt. Registration confirmations
and ordinary reminders continue to use the existing notification system.

Booking History keeps Attended and Interested, with attendance taking precedence.
Past ticketed registrations without check-in are retained under **Not checked in**
instead of being lost or labelled attended. Own-profile attended history uses the
same classification. Existing non-ticketed history and ratings retain their rule.

## Responsibilities and endpoints

Routes attach authentication and select controllers. The ticket controller owns
HTTP input/output, cache headers, and error responses. The ticket service owns
issuance, revocation, limits, eligibility, transactions, and serialization.
Credential helpers own generation/encryption. Models own schemas, indexes, and
persistence. Services receive plain auth/data arguments, never Express req/res.

| Endpoint | Responsibility |
| --- | --- |
| `GET /api/events/tickets/me` | Owner's registered ticketed events and ticket statuses; no credentials. |
| `POST /api/events/:id/ticket` | Empty body; idempotently issue/open the authenticated attendee's ticket. |
| `POST /api/events/:id/check-in` | Host-only; exactly one of `{qrPayload}` or `{code}`. |

The check-in response contains `attended`, `alreadyCheckedIn`, attendee name and
username, `checkedInAt`, and the authoritative `checkedInCount`. The backend uses
server time and returns field errors, temporary cooldown metadata, or actionable
generic failures without exposing credentials or server configuration details.

## Configuration and database rollout

The local ignored `backend/.env` now has a newly generated `TICKET_ENCRYPTION_KEY`
if one was missing. It must be 64 hexadecimal characters representing 32 random
bytes. Its value was not printed or committed. Keep the key stable and configure
the same value on every backend instance sharing this database; changing it makes
previous encrypted tickets unavailable. Store it in backend secret configuration,
never mobile code or public Expo variables.

Initial Atlas provisioning created no registrations, tickets, check-ins, or
notifications: at that point `QrCodeList` had zero documents and five indexes,
and `EventCheckInLimits` had zero documents and three indexes. Normal backend
startup also initializes these models. That initial provisioning did not update
existing events or selections or automatically mark anyone verified.

### Selective existing-event rollout

The authorized one-time administrative rollout targets selected upcoming,
published events so each host has a mix of ticketed and non-ticketed events.
Ongoing and completed events are excluded. It is an administrative exception to
the ordinary ticket-mode lock; that lock remains in place for host edits.

For each selected event, the rollout enables `useTickets` and uses the existing
`issueTicketForSelection` service for its active registered users in the same
account-fenced transaction. Existing attendees do not need to register again.
Their registration flags, versions, timestamps, and attendance history stay
unchanged; ticket creation does not mark anyone checked in. Unselected events keep
their existing behavior. No replacement registrations or extra registration
confirmations are created.

A private snapshot and per-event receipts under the ignored
`backend/.local-backups/` directory record the preimages and committed updates.
Ticket credentials remain encrypted and are not printed in the rollout summary.

The rollout completed on November 22, 2026: 27 existing upcoming events were
enabled and 375 tickets were created for their active registrations.

| Host username | Upcoming with tickets | Upcoming without tickets | Tickets issued |
| --- | --- | --- | --- |
| Joshua | 9 | 8 | 132 |
| hollow12 | 9 | 9 | 116 |
| demiberry | 9 | 8 | 127 |

Read-only database verification confirmed each active registration has a matching
ticket. Completed, archived, and unselected events were unchanged. Selected events
changed only `useTickets` and `updatedAt`; registration and attendance records
were unchanged, and no one was marked checked in. No additional application code
changes or functional tests were needed for this data update.

Installed the SDK-compatible `expo-camera` dependency. Expo config requests camera
access, enables QR scanning, and disables audio permission setup. The checked-in
Android manifest also declares camera permission and optional camera hardware.
The ignored `mobile/android/local.properties` was configured with the existing
local SDK path when compilation found it missing.

Restart the backend to load the new routes and local key. A native Android build
must be rebuilt/installed for the camera module; restarting Metro alone cannot add
native modules to an older installed binary. From `mobile`:

```powershell
npm run android
```

For a different checkout, run `npm install` in mobile first. No email/SMS/push
provider account or external QR service is required for these in-app tickets.

## Created files

| File | Responsibility |
| --- | --- |
| [QrCode.js](../backend/src/models/QrCode.js) | Ticket metadata, private credentials, unique indexes in `QrCodeList`. |
| [EventCheckInLimit.js](../backend/src/models/EventCheckInLimit.js) | Persistent manual-code attempt limits and transient TTL cleanup. |
| [ticketCredentials.js](../backend/src/services/ticketCredentials.js) | Random credentials, keyed lookups, encryption, QR payload validation. |
| [ticketService.js](../backend/src/services/ticketService.js) | Owner tickets, registration integration, host check-in, limits, counts. |
| [ticketController.js](../backend/src/controllers/ticketController.js) | Authenticated HTTP adapters and private cache/error handling. |
| [tickets.ts](../mobile/src/api/tickets.ts) | Typed owner-ticket and host check-in API helpers. |
| [EventTicket.tsx](../mobile/src/components/EventTicket.tsx) | Private QR/code modal and foreground status refresh. |
| [TicketsScreen.tsx](../mobile/src/screens/event/TicketsScreen.tsx) | Signed-in attendee's ticket list and modal access. |
| [EventTicketModeField.tsx](../mobile/src/components/EventTicketModeField.tsx) | Reusable event ticket switch, explanation, and locked state. |
| [CheckInOverlay.tsx](../mobile/src/components/CheckInOverlay.tsx) | Camera/manual host entry, permissions, validation, and result feedback. |
| [This document](qr-tickets-and-attendance.md) | Workflow, storage, rollout, and file inventory. |

## Modified backend files

| File | Summary |
| --- | --- |
| [index.js](../backend/src/index.js) | Initialize ticket and limiter models before requests. |
| [Event.js](../backend/src/models/Event.js) | Optional `useTickets` setting, default false. |
| [EventSelection.js](../backend/src/models/EventSelection.js) | Verified attendance and host/timestamp fields. |
| [events.js](../backend/src/routes/events.js) | Ticket-list, owner-ticket, and host check-in endpoints. |
| [eventData.js](../backend/src/services/eventData.js) | Ticket-mode validation and event DTO metadata. |
| [eventService.js](../backend/src/services/eventService.js) | Publish/configuration checks, ticket-mode locking, counts, expiry updates. |
| [eventDraftService.js](../backend/src/services/eventDraftService.js) | Draft/publish/new occurrence settings and cancellation revocation. |
| [eventSelectionService.js](../backend/src/services/eventSelectionService.js) | Atomic issuance/revocation, unregister guard, verified history DTOs. |
| [eventAudienceService.js](../backend/src/services/eventAudienceService.js) | Genuine checked-in counts across active accounts. |
| [eventRatingService.js](../backend/src/services/eventRatingService.js) | Conditional verified-rating eligibility and summary filtering. |
| [triggerService.js](../backend/src/services/notifications/triggerService.js) | Rating reminders require check-in for ticketed events. |

## Modified mobile files

| File | Summary |
| --- | --- |
| [events.ts API](../mobile/src/api/events.ts) | Ticket-mode inputs, attendance DTOs, shared history classification. |
| [events.ts DTO](../mobile/src/data/events.ts) | Ticket-mode, lock, and check-in count fields. |
| [EventsContext.tsx](../mobile/src/context/EventsContext.tsx) | Verified attendance state, quiet refresh, and unregister guard. |
| [UserDataContext.tsx](../mobile/src/context/UserDataContext.tsx) | Shared attended-history classification. |
| [AppNavigator.tsx](../mobile/src/navigation/AppNavigator.tsx) | Tickets route and attendance state passed to event details. |
| [UserProfileScreen.tsx](../mobile/src/screens/settings/UserProfileScreen.tsx) | Connect the former Tickets placeholder to the real screen. |
| [EventDetailsScreen.tsx](../mobile/src/screens/event/EventDetailsScreen.tsx) | View Ticket, attendance refresh/lock, and conditional rating access. |
| [CreateEventScreen.tsx](../mobile/src/screens/host/CreateEventScreen.tsx) | Ticket-mode choice included in create and draft saves. |
| [EditEventScreen.tsx](../mobile/src/screens/host/EditEventScreen.tsx) | Preserve ticket mode on edit/publish; allow choice for a new occurrence. |
| [EventHostDetailsScreen.tsx](../mobile/src/screens/host/EventHostDetailsScreen.tsx) | Scan QR action, real check-in count, and time-window handling. |
| [BookingHistoryScreen.tsx](../mobile/src/screens/settings/BookingHistoryScreen.tsx) | Verified Attended and retained Not checked in sections. |
| [BookingHistoryDetailsScreen.tsx](../mobile/src/screens/settings/BookingHistoryDetailsScreen.tsx) | Check-in facts and correct rating availability. |
| [package.json](../mobile/package.json), [package-lock.json](../mobile/package-lock.json) | SDK-compatible camera module and locked dependencies. |
| [app.json](../mobile/app.json) | Camera-only Expo plugin configuration for scanning. |
| [AndroidManifest.xml](../mobile/android/app/src/main/AndroidManifest.xml) | Native camera permission and optional hardware. |

Updated the current rating rules in
[notifications-and-event-ratings.md](notifications-and-event-ratings.md) and
[general-user-notifications.md](general-user-notifications.md).
Local-only configuration files changed: `backend/.env` and
`mobile/android/local.properties`; both remain ignored.

## Verification and manual review

- Changed backend JavaScript passed syntax checks.
- TypeScript compilation passed.
- Android debug APK compiled successfully for the x86_64 emulator architecture.
- Android Metro/Hermes export passed: 1,391 modules and 54 assets.
- Independent source review covered credential privacy, ownership, registration
  generations, cancellation/check-in races, repeat scans, time windows, ratings,
  notification scheduling, camera permissions, and stale mobile responses.
- Initial feature verification ran no automated functional/unit tests, app
  launches, actual QR scans, fake check-ins, provider sends, or application-data
  migrations. The separately authorized existing-event rollout is described above.

For manual review, use an existing event enabled by the rollout or create a new
ticketed event. Open a registered attendee's ticket and scan or enter its code as
the host during the check-in window, starting one hour before the event begins.
Check repeat-scan feedback and the unregister lock. Also review cancellation and
new registration codes, camera denial/manual fallback, the check-in window, and
post-event ratings/history for ticketed and non-ticketed events. Existing events
outside the rollout retain their original ticket setting. Prior registration
history continues to lock that setting in ordinary host edits.
