# Event storage and creation

Events are stored in the Atlas collection `eventList`. The `Event` model owns title, category, numeric price, start/end timestamps, timezone, address, place, description, optional JPEG image bytes, and the hosting user ID.

## Running

From `backend`, run `npm start`. The server waits for Atlas before listening. No new dependencies are required beyond the existing project dependencies.

Login now returns a one-hour opaque session token. The client keeps it in memory, sends it as a Bearer header, and returns to Login when a protected request reports expiry. Restart the backend and sign in again after applying this change. Remember me/local persistence is not implemented.

## Sample data

From `backend`, run `node scripts/seedEvents.js` to import seven demo events for user `6ae7814e7d5f88664b48dc90`. The account must exist in `AccountList`. The script validates fixtures, uses unique seed keys, and preserves matching existing records on rerun. It does not delete other events.

The fictional demo addresses, coordinates, posters, and missing end times are in `backend/scripts/fixtures`. Original June/September date labels use year 2026; the former Tonight sample is fixed to November 1, 2026, ending November 2. These demo events may be historical; the list includes them intentionally.

## API

| Method | Route | Behavior |
| --- | --- | --- |
| GET | `/api/events` | Public event list |
| GET | `/api/events/:id` | Event details |
| GET | `/api/events/:id/image` | JPEG bytes |
| GET | `/api/events/mine` | Session-required hosted events |
| POST | `/api/events` | Session-required creation; hostId comes from the verified session |
| GET | `/api/auth/me` | Safe signed-in account details |
| POST | `/api/auth/logout` | Invalidate the current session |

The event API exposes display strings for dates/times/prices along with canonical ISO timestamps and numeric `priceAmount`. Creation preserves cents and handles overnight schedules in the device timezone shown on the form.

Images are resized/cropped to JPEG, capped at 1 MiB, sent as base64, and stored in Atlas. A phone-local file URI is only a preview. Images load from the backend image endpoint on other devices. Backend checks size and JPEG signatures; native image manipulation produces the actual JPEG.

## Mobile flow

`EventsContext` loads public and owned lists after login. Creation adds the server response to both lists. Version checks prevent an older GET from overwriting a newly created event. Details routes carry a database ID and load from the API, with explicit loading/error/not-found states.

Host shows only events owned by the signed-in account. Interest selections remain in session memory. The old `/api/itinerary/generate` algorithm still uses `Activity.js`; it is separate from this event details/create flow.

## Checks

From `backend`, run `npm test` for the offline event/session/image/seed contract checks. These use in-memory database substitutes and never contact Atlas.

The app entry point can be checked separately from unused prototype files. A full mobile project TypeScript check currently encounters the pre-existing unfinished `ImageUploader.tsx` JSX. This event flow uses Expo ImagePicker and ImageManipulator directly.

Native Android image processing, Google Places interactions, and a real device-to-Atlas save still require runtime testing.

## Files changed

13 existing files modified; 18 files added (including seven demo JPEGs).

| Change | File |
| --- | --- |
| Modified | [backend/package.json](../backend/package.json) |
| Modified | [backend/src/index.js](../backend/src/index.js) |
| Modified | [backend/src/routes/auth.js](../backend/src/routes/auth.js) |
| Modified | [mobile/App.tsx](../mobile/App.tsx) |
| Modified | [mobile/src/api/client.ts](../mobile/src/api/client.ts) |
| Modified | [mobile/src/components/EventCard.tsx](../mobile/src/components/EventCard.tsx) |
| Modified | [mobile/src/components/LocationInputField.tsx](../mobile/src/components/LocationInputField.tsx) |
| Modified | [mobile/src/data/events.ts](../mobile/src/data/events.ts) |
| Modified | [mobile/src/navigation/AppNavigator.tsx](../mobile/src/navigation/AppNavigator.tsx) |
| Modified | [mobile/src/screens/event/EventDetailsScreen.tsx](../mobile/src/screens/event/EventDetailsScreen.tsx) |
| Modified | [mobile/src/screens/event/HomeScreen.tsx](../mobile/src/screens/event/HomeScreen.tsx) |
| Modified | [mobile/src/screens/host/CreateEventScreen.tsx](../mobile/src/screens/host/CreateEventScreen.tsx) |
| Modified | [mobile/src/screens/host/EventHostScreen.tsx](../mobile/src/screens/host/EventHostScreen.tsx) |
| Added | [backend/scripts/fixtures/images/sample-event-1.jpg](../backend/scripts/fixtures/images/sample-event-1.jpg) |
| Added | [backend/scripts/fixtures/images/sample-event-2.jpg](../backend/scripts/fixtures/images/sample-event-2.jpg) |
| Added | [backend/scripts/fixtures/images/sample-event-3.jpg](../backend/scripts/fixtures/images/sample-event-3.jpg) |
| Added | [backend/scripts/fixtures/images/sample-event-4.jpg](../backend/scripts/fixtures/images/sample-event-4.jpg) |
| Added | [backend/scripts/fixtures/images/sample-event-5.jpg](../backend/scripts/fixtures/images/sample-event-5.jpg) |
| Added | [backend/scripts/fixtures/images/sample-event-6.jpg](../backend/scripts/fixtures/images/sample-event-6.jpg) |
| Added | [backend/scripts/fixtures/images/sample-event-7.jpg](../backend/scripts/fixtures/images/sample-event-7.jpg) |
| Added | [backend/scripts/fixtures/sample-events.json](../backend/scripts/fixtures/sample-events.json) |
| Added | [backend/scripts/seedEvents.js](../backend/scripts/seedEvents.js) |
| Added | [backend/src/middleware/requireAuth.js](../backend/src/middleware/requireAuth.js) |
| Added | [backend/src/models/AuthSession.js](../backend/src/models/AuthSession.js) |
| Added | [backend/src/models/Event.js](../backend/src/models/Event.js) |
| Added | [backend/src/routes/events.js](../backend/src/routes/events.js) |
| Added | [backend/src/services/eventData.js](../backend/src/services/eventData.js) |
| Added | [backend/test/events.test.cjs](../backend/test/events.test.cjs) |
| Added | [docs/eventList-connection.md](../docs/eventList-connection.md) |
| Added | [mobile/src/api/events.ts](../mobile/src/api/events.ts) |
| Added | [mobile/src/context/EventsContext.tsx](../mobile/src/context/EventsContext.tsx) |

## Notes for data and configuration files

Source comments explain the JavaScript, TypeScript, and React components. JSON and JPEG files cannot contain those comments without changing their format, so their event-connection details are documented here.

- `backend/package.json`: the added `test` script runs Node's built-in test runner. The event test replaces database calls with in-memory substitutes, so `npm test` never performs an Atlas import.
- `backend/scripts/fixtures/sample-events.json`: migration data for the seven original samples. `seedKey` is a stable import identity, separate from MongoDB's generated `_id`. The seeder assigns the configured host account rather than trusting a fixture-supplied owner.
- Fixture `startsAt` and `endsAt` are complete timestamps; `timeZone` determines the weekday/month/day and clock times shown on screen. Overnight events have their end timestamp on the following date.
- Fixture `price` is numeric USD; zero is displayed as Free. `category` must be a saved event category, while All is only a screen filter.
- Fixture `place` is the venue name; `address` and coordinates are separate location details. Demo addresses, coordinates, and missing schedule details are fictional, as described above.
- Fixture `imageFile` is a path relative to the fixture directory. The seeder reads its JPEG bytes into `imageData`; the API later serves those bytes as the `bannerImage` URL used by the mobile app.
- `backend/scripts/fixtures/images/sample-event-1.jpg` through `sample-event-7.jpg` are generated demo banners. They are binary assets, so explanatory notes belong here rather than inside the image files.

Comments were added around validation, session ownership/expiry, list refreshes, navigation, image handling, and the import/test workflow. They describe existing behavior rather than changing it.
