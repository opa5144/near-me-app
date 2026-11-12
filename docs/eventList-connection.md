# Event storage and creation

The Atlas collection `eventList` holds event metadata: title, category, numeric
price, start/end timestamps, timezone, address, place, description, and the
hosting account ID. Photo records live separately in `EventPhotos`, linked by
`eventId`. Active services never read embedded or single-image fields from
`eventList` as a fallback. See [the collection cutover](split-collection-cutover.md)
for the approved copy and runtime transition.

## Running

From `backend`, run `npm start`. The server waits for Atlas before listening.
Sign in through the mobile app before creating or managing events. Sessions use
an opaque Bearer token held in memory; restarting the mobile app requires signing
in again. MFA-enabled accounts complete authenticator/recovery verification
before receiving a full session. Remember me/local session persistence is not
implemented.

## Existing records and sample data

Events come from the API, not a mobile `sampleEvents` array. The old demo seeder,
booking-history seeder, fixtures, and their test files are no longer shipped in
this repository. There is no supported seed command on this page. Create records
through the app or current authenticated API instead of restoring an old script
that writes image bytes into the main event collection.

Existing event IDs and `seedKey` values remain metadata. Removing superseded
photo fields must not delete events, change these identifiers, or remove their
indexes. Historical events stay available to their hosts and, when selected by
the current account, in Booking History; expired events do not appear in public
discovery or accept changes to Interested/Attending selections.

## API

| Method | Route | Behavior |
| --- | --- | --- |
| GET | `/api/events` | Public discovery for active owners; events remain visible until their end instant. |
| GET | `/api/events/mine` | Session-required hosted events, including past events. |
| GET | `/api/events/:id` | Event details for an active owner. |
| GET | `/api/events/:id/image` | The first ordered photo as JPEG bytes; 404 when no photo exists. |
| GET | `/api/events/:id/photos/:photoId` | One photo belonging to this event, from `EventPhotos`. |
| POST | `/api/events` | Session-required creation; `hostId` comes from the verified session. |
| PATCH | `/api/events/:id` | Owner-required event editing and optional ordered photo changes. |
| GET | `/api/auth/me` | Safe combined signed-in account details. |
| POST | `/api/auth/logout` | Invalidate the current session. |

Event responses contain display strings for dates, times and prices alongside
canonical ISO timestamps and numeric `priceAmount`. Dates include a year and are
formatted in the event's saved timezone. Creation preserves cents and validates
future starts, minimum duration, and overnight schedules.

## Photo contract

Each event may have zero to five ordered photos. The first is the cover. The
picker prepares 16:9 JPEGs up to 1280 pixels wide and 1 MiB decoded per photo;
a phone-local file URI is only a preview. New uploads use
`photos: [{ imageBase64: "..." }]`. Event edits can retain existing photos with
`{ id: "..." }` entries in the desired order. IDs must belong to that event.

Omitting `photos` during an edit preserves the authoritative photo collection.
An explicit `photos: []` clears its photo records. The older `imageBase64` request
field remains accepted for a single upload, but its bytes also go exclusively
to `EventPhotos`; it is not a request to recreate old main-record fields.

Ordinary responses expose only `photos: [{ id, url }]` and, when present,
`bannerImage` for the first photo. Lists and booking history batch-load metadata.
Bytes are excluded from normal queries and fetched by photo/image endpoints,
which also check that the hosting account remains active. Parent metadata and
photo changes commit through the same account-fenced transaction. Retained
photo IDs and timestamps are preserved.

## Mobile flow

`EventsContext` loads public and owned lists after login. Creation adds the saved
server response to both lists; version checks prevent an older GET from erasing
newly created records. Detail routes carry a database ID and load from the API,
with loading, retry and not-found states. Shared photo components provide cover
slideshows, galleries and full-screen viewing.

Interested and Attending are independent, persisted account selections rather
than memory-only flags. [Settings and booking history](settings-booking.md)
describes their private history views. The older itinerary generator still uses
`Activity.js`; it is separate from this event flow.

## Relevant source files

| File | Responsibility |
| --- | --- |
| [Event.js](../backend/src/models/Event.js) | Main `eventList` metadata schema and indexes. |
| [EventPhoto.js](../backend/src/models/EventPhoto.js) | Separate `EventPhotos` records, event references, hidden JPEG bytes and ordered slots. |
| [eventService.js](../backend/src/services/eventService.js) | Public/owner reads, validation, ownership and transactional event/photo writes. |
| [eventData.js](../backend/src/services/eventData.js) | Event input rules and display/API serialization. |
| [photoCollectionService.js](../backend/src/services/photoCollectionService.js) | Collection-only metadata/image reads and transactional ordered replacement. |
| [photoData.js](../backend/src/services/photoData.js) | JPEG limits, resource-local retained IDs and photo serialization. |
| [eventSelectionService.js](../backend/src/services/eventSelectionService.js) | Persisted selections and private history with separate photo metadata. |
| [events.js](../backend/src/routes/events.js) | Event endpoints and authentication middleware. |
| [events.ts](../mobile/src/api/events.ts) | Typed mobile event, selection and history requests. |
| [EventsContext.tsx](../mobile/src/context/EventsContext.tsx) | Shared event lists and persisted account selections. |
| [CreateEventScreen.tsx](../mobile/src/screens/host/CreateEventScreen.tsx) | Event form, schedule validation and photo uploads. |
| [EditEventScreen.tsx](../mobile/src/screens/host/EditEventScreen.tsx) | Owner editing and explicit photo changes. |

## Legacy cleanup and verification boundary

The subsequent approved [legacy-field cleanup](legacy-field-cleanup.md) removed
obsolete original fields after a fresh private backup. Its integrity report
verifies preserved event records, metadata, identifiers, timestamps, indexes,
and current EventPhotos records. The old copy/refresh utility is retired.

Runtime verification remains the user's manual workflow. No application tests,
type checks, syntax checks, app launches, or API checks were run. Authorized
database snapshot, backup, cleanup, and integrity operations ran separately.
Removed fixture/test commands above are not current verification instructions.
