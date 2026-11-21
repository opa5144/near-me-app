# Event lifecycle and picker overlays — November 21, 2026

> Maintenance update: one-time import, repair, and manual reorganization scripts
> referenced in this report were subsequently retired. The lifecycle worker still
> performs automatic event moves; shared event reads, history, ratings, and photos
> remain part of the app. The administrative command examples and those file-list
> entries are historical. See the [repository cleanup](repository-cleanup-2026-11-21.md).

Published upcoming and ongoing events live in `eventList`. Completed events move
to `PastEventsList` at their end instant. Cancelled, manually archived, and private
draft events live in `ArchivedEvents`, distinguished by `status`. Cancelled events
stay archived when their scheduled end passes.

Registration defaults to event end, so people can join ongoing events. An explicit
earlier host deadline still applies. Registration/invitation eligibility, mobile
controls, reminder scheduling, notification policy, repair tools, and formatted API
responses use the same default.

Completed events are read-only. Reschedule pre-fills a new event form and creates
a new event ID with `sourceEventId` pointing to the completed occurrence. Retained
photos are copied with new photo IDs. Attendance, interest, ratings, invitations,
and notification history stay attached to the original event.

## Persistence and HTTP responsibilities

Routes attach authentication and delegate to controllers. Controllers translate
HTTP input/output. Services validate lifecycle rules, use the existing account
write fence and retryable transactions, and call the persistence helpers in
`models/eventStore.js`. Services never receive Express `req` or `res`.

`Event`, `PastEvent`, and `ArchivedEvent` share a schema. Physical moves copy the
complete stored document and delete its original within one transaction. IDs,
original timestamps, and fields survive. Destination collisions abort rather than
overwrite records. Shared reads use a snapshot across the three collections, so a
concurrent move cannot temporarily hide an event from history, details, photos,
ratings, invitations, or notification processing.

`EventPhotos`, selections, ratings, and notification collections stay in place.
Draft details and images are visible only to their owning authenticated host;
image responses use private/no-store caching and vary by Authorization.

The lifecycle worker catches up at startup, scans bounded batches, and checks for
newly completed events every 30 seconds. This worker operates independently of
notification delivery. API/UI date checks take effect at the actual end instant
even during the short physical-move delay. Set
`EVENT_LIFECYCLE_WORKER_ENABLED=false` only when intentionally suspending moves.

## Host actions

The dashboard has Active, Completed, Archived, and Drafts filters. Private drafts
may be incomplete; publication requires valid complete event details. Editing a
draft preserves its ID on publication. Cancelling or manually archiving an active
event stops registration and emits the existing cancellation notification to
interested/attending users. A manually archived event retains `status: archived`.
Completed records cannot be cancelled or manually archived through these actions.

| Endpoint | Purpose |
| --- | --- |
| `GET /api/events/mine` | All lifecycle states for the authenticated host. |
| `POST /api/events/drafts` | Save a private partial draft. |
| `PATCH /api/events/:id/draft` | Update the owner's private draft. |
| `POST /api/events/:id/publish` | Validate and publish a draft with the same ID. |
| `POST /api/events/:id/archive` | Archive an active event; optional `{reason}`. |
| `POST /api/events/:id/cancel` | Cancel an active event; optional `{reason}`. |
| `POST /api/events/:id/reschedule` | Create a new occurrence from a completed event. |

Existing create/update, details, photos, selection, booking-history, invitation,
and rating routes retain their response wrappers. Event DTOs add `storage`, expanded
`status`, `archivedAt`, `archiveReason`, and `sourceEventId`. Unscheduled drafts use
empty date/time strings and stay out of discovery and itinerary suggestions.

## Compact selection overlays

Category, calendar, clock, and weekly-hours controls display compact summaries.
Opening an overlay copies saved values into an independent draft. Done commits;
Cancel, backdrop, and Android Back discard edits from that opening. Business hours
use an internal clock view in the same overlay rather than stacked native modals.
Errors remain underneath the relevant controls and validation runs on exit or
confirmation, rather than while scrolling/selecting.

Event/store forms, Search, Preferences, and Account date of birth use the reusable
controls. Date labels remain `MM/DD/YYYY`, while calendar values remain canonical
`YYYY-MM-DD`. The calendar supports direct year selection for dates such as DOB;
DOB also supports clearing and blocks future dates. Opening/confirming the clock
does not round an existing time. Existing date parts are preserved while editing
clock parts. Generated itineraries reconcile saved IDs with current discovery so
completed and unavailable events disappear there too.

## Initial Atlas reorganization

Applied at 12:19 PM America/New_York on November 21, 2026:

| Collection | Before | After |
| --- | ---: | ---: |
| `eventList` | 91 | 54 |
| `PastEventsList` | 0 | 37 |
| `ArchivedEvents` | 0 | 0 |

All 37 moves committed. The preview found no invalid schedules or conflicting
IDs, and the post-move report found no remaining due moves or conflicts. The empty
archive collection and its indexes were created for subsequent host actions.
An independent read-only comparison against the private snapshot confirmed all
91 original event documents retained identical fields and IDs across their new
locations, with no duplicate event IDs.
Existing photos, selections, ratings, invitations, notifications, jobs, and delivery
records were not rewritten by this operation. A private EJSON metadata snapshot
and counts report are stored under ignored `backend/.local-backups/` with run ID
`2026-11-21T17-19-23-503Z-47017fd7`.

Administrative commands from `backend`:

```powershell
node scripts/organizeEventCollections.js          # Read-only preview
node scripts/organizeEventCollections.js --apply  # Snapshot, then transactional moves
```

Stop older backend processes before running the initial apply; they do not have
the shared cross-collection reads. Repeat previews are read-only. Repeated applies
only move newly eligible records. Never restore the snapshot over newer records
without reviewing the differences first.

## Created files

| File | Responsibility |
| --- | --- |
| [PastEvent.js](../backend/src/models/PastEvent.js) | Shared event schema in completed storage. |
| [ArchivedEvent.js](../backend/src/models/ArchivedEvent.js) | Shared schema for cancelled, archived, and draft records. |
| [eventStore.js](../backend/src/models/eventStore.js) | Snapshot reads, model selection, and atomic physical moves. |
| [eventDraftService.js](../backend/src/services/eventDraftService.js) | Draft, publish, archive, and new-occurrence rules. |
| [eventLifecycleService.js](../backend/src/services/eventLifecycleService.js) | Preview and bounded end-of-event relocation. |
| [eventLifecycleWorker.js](../backend/src/workers/eventLifecycleWorker.js) | Restart catch-up, polling, and shutdown. |
| [organizeEventCollections.js](../backend/scripts/organizeEventCollections.js) | Explicit administrative preview, backup, and apply. |
| [SelectionOverlay.tsx](../mobile/src/components/SelectionOverlay.tsx) | Shared accessible overlay with Done/Cancel and Android Back handling. |
| [CategoryPickerField.tsx](../mobile/src/components/CategoryPickerField.tsx) | Reusable category summary and multiple-selection overlay. |
| [eventAvailability.ts](../mobile/src/utils/eventAvailability.ts) | Shared published/current/not-ended discovery predicate. |
| [This document](event-lifecycle-and-picker-overlays.md) | Behavior, rollout, and file inventory. |

## Modified backend files

| File | Change |
| --- | --- |
| [Event.js](../backend/src/models/Event.js) | Lifecycle statuses, partial draft fields, source ID, archive metadata, indexes. |
| [events.js](../backend/src/routes/events.js) | Lifecycle endpoints and authenticated draft image access. |
| [eventController.js](../backend/src/controllers/eventController.js) | HTTP adapters and private image cache headers. |
| [index.js](../backend/src/index.js) | Initialize lifecycle models and start/stop its independent worker. |
| [eventService.js](../backend/src/services/eventService.js) | Current discovery; cross-collection host/detail/photo reads; completed edit protection. |
| [eventData.js](../backend/src/services/eventData.js) | Partial draft validation, ongoing edits, end-based cutoff, lifecycle DTO fields. |
| [eventSelectionService.js](../backend/src/services/eventSelectionService.js) | Shared reads for history/selections and ongoing registration. |
| [eventRatingService.js](../backend/src/services/eventRatingService.js) | Completed collection rating access and unavailable-state guards. |
| [eventInviteService.js](../backend/src/services/eventInviteService.js) | Shared event resolution and end-based invitation eligibility. |
| [photoCollectionService.js](../backend/src/services/photoCollectionService.js) | Source-owned photo validation and new IDs when copying to a new occurrence. |
| [jobService.js](../backend/src/services/notifications/jobService.js) | Cross-collection fanout and restart reminder reconciliation. |
| [policyService.js](../backend/src/services/notifications/policyService.js) | Archived cancellation eligibility, completed rating prompts, and stale-deadline rejection. |
| [triggerService.js](../backend/src/services/notifications/triggerService.js) | End-based schedules and archive/cancel snapshots. |
| [templates.js](../backend/src/services/notifications/templates.js) | End-based closing-time rendering. |
| [repairService.js](../backend/src/services/notifications/repairService.js) | Historical notification audit/repair across lifecycle collections. |
| [demoCommunityService.js](../backend/src/services/demoCommunityService.js) | Existing administrative population reads all event storage; new historical records use completed storage. |
| [storeHistoryPopulationService.js](../backend/src/services/storeHistoryPopulationService.js) | Existing history import resolves completed events after moves. |
| [auditCurrentData.js](../backend/scripts/auditCurrentData.js) | Audit event hosts/states across collections and report duplicate event IDs. |
| [refreshDemoCommunity.js](../backend/scripts/refreshDemoCommunity.js) | Include new event collections in administrative counts. |

## Modified mobile files

| File | Change |
| --- | --- |
| [events.ts API](../mobile/src/api/events.ts) | Lifecycle request helpers and owner-authenticated image headers. |
| [events.ts DTO](../mobile/src/data/events.ts) | Expanded status, storage, and source/archive fields. |
| [AppNavigator.tsx](../mobile/src/navigation/AppNavigator.tsx) | New-occurrence route and cache updates after lifecycle actions. |
| [EventsContext.tsx](../mobile/src/context/EventsContext.tsx) | Keep draft/archive results in host cache while removing them from discovery. |
| [EventHostScreen.tsx](../mobile/src/screens/host/EventHostScreen.tsx) | Four host filters and private draft cards. |
| [EventHostDetailsScreen.tsx](../mobile/src/screens/host/EventHostDetailsScreen.tsx) | Draft editing, archive/cancel, completed reschedule, and private media. |
| [CreateEventScreen.tsx](../mobile/src/screens/host/CreateEventScreen.tsx) | Save Draft action and reusable selection controls. |
| [EditEventScreen.tsx](../mobile/src/screens/host/EditEventScreen.tsx) | Draft save/publish, completed-event new occurrence, and reusable controls. |
| [CreateStoreScreen.tsx](../mobile/src/screens/host/CreateStoreScreen.tsx) | Category overlay and compact weekly-hours editor. |
| [hostFormUtils.ts](../mobile/src/screens/host/hostFormUtils.ts) | Partial draft checks and preservation of ongoing start time during edits. |
| [EventDetailsScreen.tsx](../mobile/src/screens/event/EventDetailsScreen.tsx) | End-based registration and archive/draft action guards. |
| [ItineraryScreen.tsx](../mobile/src/screens/event/ItineraryScreen.tsx) | Reconcile generated/saved outings with currently available events. |
| [SearchScreen.tsx](../mobile/src/screens/event/SearchScreen.tsx) | Commit category filter changes together on overlay confirmation. |
| [PreferencesScreen.tsx](../mobile/src/screens/settings/PreferencesScreen.tsx) | Compact preferred-category overlay. |
| [AccountScreen.tsx](../mobile/src/screens/settings/AccountScreen.tsx) | Optional DOB calendar overlay and local-date future check. |
| [CategoryFilter.tsx](../mobile/src/components/CategoryFilter.tsx) | Overlay-based shared search filter. |
| [DatePickerField.tsx](../mobile/src/components/DatePickerField.tsx) | Calendar overlay, direct year selection, bounds, and optional clear. |
| [TimePickerField.tsx](../mobile/src/components/TimePickerField.tsx) | Draft clock overlay and reusable embedded clock content. |
| [BusinessHoursEditor.tsx](../mobile/src/components/BusinessHoursEditor.tsx) | Compact weekly summary with one overlay and internal clock editor. |
| [PhotoCollection.tsx](../mobile/src/components/PhotoCollection.tsx) | Optional authenticated image sources for private drafts. |
| [PhotoPickerField.tsx](../mobile/src/components/PhotoPickerField.tsx) | Optional authenticated saved-photo previews. |
| [EventCard.tsx](../mobile/src/components/EventCard.tsx) | Archive/draft state labels and no unauthenticated draft image requests. |

Also updated the current registration and rescheduling rules in
[general-user-notifications.md](general-user-notifications.md) and
[notifications-and-event-ratings.md](notifications-and-event-ratings.md).

## Verification boundary

TypeScript compilation and changed backend JavaScript syntax checks passed.
No automated functional/unit tests, mobile UI flows, or provider sends were run.
The Atlas move was an administrative operation with read-only preflight and
post-move counts, not a fabricated registration/rating test. Restart the backend
and reload the mobile app before manually exercising the new flows.

Existing unrelated installer files and a settings-screen line-ending-only change
were left alone; they are not part of this feature's file inventory.
