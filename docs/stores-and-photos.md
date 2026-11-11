# Stores, photo galleries, and booking history sections

## Behavior

Booking History shows two sections for the account's ended selected events.
Attended contains every entry with `attending: true`. Interested contains entries
with `interested: true` and `attending: false`. Entries with both flags appear
only under Attended. Saved flags remain independent; the detail label uses the
same priority. History stays read-only, while photos can be viewed and swiped.

Create Store publishes through the authenticated API rather than logging a
draft. Saved stores appear under Your Stores on the Host Dashboard. Each opens
a Store Details route by its database ID, with address, categories, description,
seven-day hours, owner name, a photo slideshow, and a clickable gallery.

The exact MongoDB collection is `StoreList`. Each document has an automatic ID,
an authenticated `ownerId` referencing User, name, category array, description,
address/place/optional place ID and coordinates, IANA timezone, seven weekday
entries, ordered photos, and timestamps. Categories reuse Music, Dance, Food,
Film, Workshop, and Art. Every weekday is explicitly open or closed. Open days
have one distinct opening/closing HH:mm pair; a closing time earlier than the
opening means the following day. Closed days store null times. Split shifts and
24-hour equal-time intervals are not part of this version.

Photos are optional, with at most five per event or store. The first photo is
the cover. Shared picker controls add, remove, reorder, and choose the cover.
The existing picker/manipulator converts each selected photo into a cropped
16:9 JPEG, up to 1280 pixels wide and 1 MiB decoded. Five maximum-size Base64
uploads fit the existing 10 MiB JSON request limit. No dependencies were added.
Only photo metadata/URLs appear in ordinary API responses; binary JPEG data is
hidden by the schema and served separately. Resource ownership and account
closure protections also apply to photos.

Existing single-photo events keep working without a migration. An old image
appears as a legacy photo; an explicit edit can retain and convert it into the
ordered collection. Omitted photo updates preserve the collection. An explicit
empty array removes all photos, including the legacy image. Retained photo IDs
must belong to that event. Images from another event or store cannot be attached
by guessing an ID. Existing event cards continue using `bannerImage` for covers.

The shared photo collection shows a manually swipeable hero with indicators and
a thumbnail gallery. Clicking either opens a full-screen viewer at that photo,
with swipe, previous/next, and close controls. It is reused by public event,
host event, past booking, and store details.

## Backend flow and endpoints

New store requests follow routes -> controllers -> services -> Mongoose models.
Services accept plain input/authentication values and do not depend on Express
requests or responses. Store creation uses the account-fenced transaction so
ownership cannot be supplied by the client or revived after account closure.
Closed owners' stores/photos are retained but hidden through the API.

- `GET /api/stores` returns `{ stores }` for active owners.
- `GET /api/stores/mine` requires authentication and returns the owner's stores.
- `POST /api/stores` requires authentication and returns `{ store }` with 201.
- `GET /api/stores/:id` returns `{ store }`.
- `GET /api/stores/:id/image` returns the current cover JPEG.
- `GET /api/stores/:id/photos/:photoId` returns a resource-local JPEG.
- `GET /api/events/:id/photos/:photoId` adds individual event-photo retrieval.
- The existing event `/image` endpoint now serves the current first-photo cover.

Photo responses are ordered `{ id, url }` arrays. Create/edit requests use ordered
`photos: [{ imageBase64 }]` entries for new uploads or `{ id }` entries for retained
event photos. Store creation accepts new uploads; no store editing/deletion UI
or separate public store-search screen was added in this scope.

## Created files (12)

| File | Summary |
| --- | --- |
| [Store.js](../backend/src/models/Store.js) | Owner-linked StoreList schema, category/hours/location validation, photos, timestamps and indexes. |
| [photoSchema.js](../backend/src/models/photoSchema.js) | Reusable embedded photo schema with stable IDs and hidden image bytes. |
| [storeService.js](../backend/src/services/storeService.js) | Store input rules, ownership, queries, fenced creation, DTOs and photo retrieval. |
| [photoData.js](../backend/src/services/photoData.js) | Shared limits, JPEG validation, resource-local retention/legacy conversion, DTOs and binary normalization. |
| [storeController.js](../backend/src/controllers/storeController.js) | HTTP store envelopes/statuses/errors and raw JPEG responses. |
| [stores.js](../backend/src/routes/stores.js) | Store endpoint and cache/authentication middleware wiring. |
| [stores.ts](../mobile/src/api/stores.ts) | Typed store creation/owner-list/detail requests and weekly-hours DTOs. |
| [photos.ts](../mobile/src/api/photos.ts) | Shared photo types, JPEG preparation, retained/new request conversion and legacy fallback. |
| [PhotoPickerField.tsx](../mobile/src/components/PhotoPickerField.tsx) | Five-photo picker with preparation feedback, removal, ordering and cover selection. |
| [PhotoCollection.tsx](../mobile/src/components/PhotoCollection.tsx) | Shared swipeable hero, thumbnail gallery and full-screen viewer. |
| [StoreDetailsScreen.tsx](../mobile/src/screens/host/StoreDetailsScreen.tsx) | ID-based store loading, retry states, weekly hours and shared galleries. |
| [stores-and-photos.md](stores-and-photos.md) | This behavior and change inventory. |

## Modified files (17)

| File | Summary |
| --- | --- |
| [backend/src/index.js](../backend/src/index.js) | Mounts the store router at /api/stores. |
| [models/Event.js](../backend/src/models/Event.js) | Adds an ordered embedded photo collection while distinguishing legacy records from explicit empty galleries. |
| [services/eventData.js](../backend/src/services/eventData.js) | Validates the photo input contract and returns photo metadata plus first-photo cover. |
| [services/eventService.js](../backend/src/services/eventService.js) | Resolves retained/new/legacy photos transactionally, preserves omissions, clears explicit removals and serves photos. |
| [controllers/eventController.js](../backend/src/controllers/eventController.js) | Sends individual event photos with existing privacy/cache/image headers. |
| [routes/events.js](../backend/src/routes/events.js) | Adds the individual-photo endpoint. |
| [mobile/src/data/events.ts](../mobile/src/data/events.ts) | Adds optional ordered photo metadata to EventItem. |
| [mobile/src/api/events.ts](../mobile/src/api/events.ts) | Adds ordered photo inputs while retaining the previous single-image field for compatibility. |
| [CreateEventScreen.tsx](../mobile/src/screens/host/CreateEventScreen.tsx) | Uses the shared photo picker and sends ordered photos on creation. |
| [EditEventScreen.tsx](../mobile/src/screens/host/EditEventScreen.tsx) | Loads retained photos, tracks changes, and sends explicit additions/reordering/removals only when changed. |
| [CreateStoreScreen.tsx](../mobile/src/screens/host/CreateStoreScreen.tsx) | Saves real stores with multiple categories, recurring hours/timezone, address and photos; guards publishing and shows errors. |
| [EventHostScreen.tsx](../mobile/src/screens/host/EventHostScreen.tsx) | Loads the owner's stores on focus and displays cover/name/category/address cards with loading/retry states. |
| [AppNavigator.tsx](../mobile/src/navigation/AppNavigator.tsx) | Registers Store Details, opens stores by ID, and returns to the dashboard after successful publishing. |
| [EventDetailsScreen.tsx](../mobile/src/screens/event/EventDetailsScreen.tsx) | Replaces the single hero image with the shared slideshow and adds the gallery. |
| [EventHostDetailsScreen.tsx](../mobile/src/screens/host/EventHostDetailsScreen.tsx) | Reuses slideshow/gallery while preserving host actions. |
| [BookingHistoryScreen.tsx](../mobile/src/screens/settings/BookingHistoryScreen.tsx) | Renders exclusive Attended/Interested sections with counts and individual empty states. |
| [BookingHistoryDetailsScreen.tsx](../mobile/src/screens/settings/BookingHistoryDetailsScreen.tsx) | Adds read-only photo viewing and prioritizes the Attended history label. |

## Review and manual verification

Source/diff review covered the route/controller/service boundary, owner/session
checks, archived-account behavior, photo ID isolation and byte exclusions,
legacy retention/clearing, payload limits, navigation and async publishing,
weekly hours, and history deduplication. No files were deleted.

As requested, no tests, type checks, lint, syntax execution, app launches, or
API/database calls were run. No records were imported or migrated by this work.
Restart the backend and reload the mobile app for manual verification. Publishing
a store writes its record and photos into StoreList through the application.
