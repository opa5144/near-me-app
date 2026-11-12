# Stores, photo galleries, and booking history sections

The active layout keeps main metadata in `eventList` and `StoreList`, and stores
photo records in `EventPhotos` and `StorePhotos`. Main-record embedded/single-image
fields are not a runtime fallback. [The collection cutover](split-collection-cutover.md)
documents the approved copy and transition. The subsequent
[legacy-field cleanup](legacy-field-cleanup.md) removed the obsolete original
fields after a fresh backup and successful integrity verification.

## Store behavior

Create Store publishes through the authenticated API. Saved stores appear under
Your Stores on the Host Dashboard. Each opens a Store Details route by database
ID, showing address, categories, description, seven-day hours, owner name, a
photo slideshow and clickable gallery. Publishing blocks duplicate submissions,
navigation and editing until the request settles; failures keep the form available.

The exact main collection is `StoreList`. Each document has an automatic ID,
an authenticated `ownerId` referencing User, name, category array, description,
address/place/optional place ID and coordinates, IANA timezone, seven weekday
entries, and timestamps. Coordinates must be supplied together or both omitted.
Photo documents reference that store through `StorePhotos.storeId`; they are not
embedded in its metadata.

Categories reuse Music, Dance, Food, Film, Workshop and Art, with one or more
unique selections. Every weekday is explicitly open or closed. Open days have
one distinct opening/closing HH:mm pair; a closing time earlier than the opening
means the following day. Closed days store null times. Split shifts and 24-hour
equal-time intervals are not part of this version.

No store editing/deletion UI or separate public store-search screen was added.
The previous placeholder Google Maps import button is not part of the published
form; address selection uses the existing location search.

## Photo behavior and storage

Photos are optional, with at most five per event or store. The first photo is
the cover. Shared picker controls add, remove, reorder and choose the cover.
Each selected image becomes a cropped 16:9 JPEG, up to 1280 pixels wide and 1 MiB
decoded. Five maximum-size Base64 uploads fit the existing 10 MiB JSON request
limit. A device-local file URI is used only for preview.

`EventPhotos` and `StorePhotos` contain stable photo IDs, the parent ID, hidden
JPEG bytes, MIME type, `displayOrder` from 0 to 4, and timestamps. Unique
(parent ID, display order) indexes provide the bounded ordered slots; collection
and index provisioning is explicit rather than automatic at application startup.
Ordinary API responses return only ordered `photos: [{ id, url }]` and the first
photo's URL as `bannerImage`. Lists and history batch-load metadata. Image
endpoints select bytes only from the separate collections and check the active
parent owner. Images from another event/store cannot be attached by guessing an ID.

Create requests send `photos: [{ imageBase64: "..." }]`; store creation accepts
only new uploads. Event edits may mix new uploads with retained `{ id: "..." }`
entries in the desired order. Omission preserves the existing photo collection;
`photos: []` clears only its separate photo records. Retained photos keep their
IDs and timestamps. Parent creation and photo insertion, or event metadata and
photo edits, use the same account-fenced transaction. No active service rewrites
or clears an original embedded image as part of these operations.

The older event `imageBase64` request field remains compatible for one new photo,
but the upload is written to `EventPhotos`. The backend does not emit a legacy
photo ID or read an archived image when the new collection is empty.

The shared display provides a swipeable hero with indicators and a thumbnail
gallery. Selecting either opens the chosen photo full screen, with swipe,
previous/next and close controls. Public event, host event, past booking and store
details reuse these components.

## Booking history

Booking History shows two sections for the account's ended selected events.
Attended contains entries with `attending: true`. Interested contains entries
with `interested: true` and `attending: false`. Entries with both flags appear
only under Attended. Saved flags remain independent; the detail label uses the
same priority. History is read-only, while photos remain viewable and swipeable.

## Backend flow and endpoints

Requests follow routes -> controllers -> services -> Mongoose models. Services
accept plain input/authentication values, not Express requests or responses.
Store creation takes ownership from the verified session and uses the account
write fence. Closed owners' stores and separate photo records are retained but
hidden through public API reads.

| Method | Route | Response |
| --- | --- | --- |
| GET | `/api/stores` | `{ stores }` for active owners. |
| GET | `/api/stores/mine` | Session-required owner list, `{ stores }`. |
| POST | `/api/stores` | Session-required creation, `{ store }` with status 201. |
| GET | `/api/stores/:id` | `{ store }` for an active owner. |
| GET | `/api/stores/:id/image` | Current first-photo cover JPEG, or 404. |
| GET | `/api/stores/:id/photos/:photoId` | One JPEG belonging to this store. |
| GET | `/api/events/:id/photos/:photoId` | One JPEG belonging to this event. |
| GET | `/api/events/:id/image` | Current first-photo event cover JPEG, or 404. |

## Relevant files

| File | Responsibility |
| --- | --- |
| [Store.js](../backend/src/models/Store.js) | Owner-linked main metadata, category/hours/location rules, timestamps and indexes. |
| [EventPhoto.js](../backend/src/models/EventPhoto.js) | Separate `EventPhotos` schema with event references and bounded order. |
| [StorePhoto.js](../backend/src/models/StorePhoto.js) | Separate `StorePhotos` schema with store references and bounded order. |
| [storeService.js](../backend/src/services/storeService.js) | Input validation, owner reads, fenced publishing and store/photo DTOs. |
| [photoCollectionService.js](../backend/src/services/photoCollectionService.js) | Batched separate-collection metadata, image reads and transactional replacement. |
| [photoData.js](../backend/src/services/photoData.js) | JPEG limits, resource-local retention, byte normalization and URLs. |
| [eventData.js](../backend/src/services/eventData.js) | Event photo input contract and explicit metadata serialization. |
| [eventService.js](../backend/src/services/eventService.js) | Collection-backed event photo reads/writes and compatibility uploads. |
| [eventSelectionService.js](../backend/src/services/eventSelectionService.js) | Private history with batched `EventPhotos` metadata. |
| [storeController.js](../backend/src/controllers/storeController.js) | Store HTTP envelopes, errors and JPEG responses. |
| [stores.js](../backend/src/routes/stores.js) | Endpoint, cache and authentication wiring. |
| [stores.ts](../mobile/src/api/stores.ts) | Typed store creation, owner list, details and weekly hours. |
| [photos.ts](../mobile/src/api/photos.ts) | Shared photo types, JPEG preparation and retained/new request conversion. |
| [PhotoPickerField.tsx](../mobile/src/components/PhotoPickerField.tsx) | Photo preparation, ordering, cover choice and removal. |
| [PhotoCollection.tsx](../mobile/src/components/PhotoCollection.tsx) | Hero, thumbnail gallery and full-screen viewer. |
| [CreateStoreScreen.tsx](../mobile/src/screens/host/CreateStoreScreen.tsx) | Store publishing form and async/navigation guards. |
| [StoreDetailsScreen.tsx](../mobile/src/screens/host/StoreDetailsScreen.tsx) | ID-based loading/retry, hours and gallery. |
| [EventHostScreen.tsx](../mobile/src/screens/host/EventHostScreen.tsx) | Owner store cards, focus refresh and loading/retry states. |
| [AppNavigator.tsx](../mobile/src/navigation/AppNavigator.tsx) | Store Details routing and post-publish return. |
| [BookingHistoryScreen.tsx](../mobile/src/screens/settings/BookingHistoryScreen.tsx) | Exclusive Attended/Interested history sections. |
| [BookingHistoryDetailsScreen.tsx](../mobile/src/screens/settings/BookingHistoryDetailsScreen.tsx) | Read-only history details and photos. |

## Legacy cleanup and verification boundary

The separately approved cleanup removed superseded `photos`, `imageData` and
`imageMimeType` fields from main event/store documents. Its private backup and
post-cleanup report verify that main documents, metadata, IDs, timestamps,
indexes, and all authoritative photo records were preserved. The historical
copy/refresh utility is retired in every mode.

The old demo seeders and fixture/test instructions are no longer current. New
records should be published through the current application/API, which writes
metadata and photos to their respective collections.

Application verification remains the user's manual workflow. No tests, type
checks, lint, syntax execution, app launches, or API checks were run; authorized
database snapshot, backup, cleanup, and integrity operations ran separately.
