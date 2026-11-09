# Booking history and saved settings

This change connects Booking History, My Preferences, Notifications, and event
choices to the signed-in user's Atlas records. It also adds inline signup errors
and removes the Location settings page.

## Event choices and booking history

`EventSelections` links one user ID to one event ID, with independent `interested`
and `attending` booleans and a unique user/event index. The public event details
screen now saves both choices through authenticated requests. Plans includes
either choice. A past interest alone is not treated as attendance on the profile.

Booking History includes selected events once their canonical `endsAt` has passed,
newest first. Its detail screen shows event information and the saved choices with
no RSVP, sharing, maps, calendar, or host-profile controls. History reloads by the
private selection ID; only its owner can read it. The information is read-only
current event data, not an immutable purchase receipt or proof of attendance.

Selections for ended events cannot be changed. A host account's permanent closure
continues to hide its events, including from history, while retaining the records.
Writes fence both the selecting account and host in the existing archive-safe
transaction, so closure prevents later changes to related records.

The old Interested list was session memory, not database data. Those past choices
cannot be recovered or backfilled. No sample bookings or selections were inserted.
History fills from newly persisted choices as those events end.

## Category and city preferences

`UserPreferences` has one unique document per user ID. Category flags use the real
event schema enum: Music, Dance, Food, Film, Workshop, and Art. Unset/new category
choices default to false, and all supported categories are shown by the API.

Cities are searched worldwide using the existing server-side Maps key and the
Places API city-only filter. Each city choice stores only its place ID and a
`subscribed` boolean. Turning one off retains a false row. City labels are looked
up fresh for display, with an unavailable-name fallback that preserves the saved
choice. An unlisted city is implicitly unsubscribed. The database does not need
an exhaustive list of every city in the world. Up to 100 city choices can be saved.

New city IDs are verified as geographic city/town types before saving. Search
uses a three-character minimum, a short debounce, and request cancellation. The
screen includes Google Maps attribution. Provider results and city labels are
not persisted as a separate places-content cache.

Reference: [Autocomplete city filtering](https://developers.google.com/maps/documentation/places/web-service/place-autocomplete#includedPrimaryTypes)
and [Places data storage/attribution guidance](https://developers.google.com/maps/documentation/places/web-service/policies).

## Notification settings

`NotificationSettings` has one unique document per user ID and stores all 19
existing boolean options. The original defaults are preserved: switches start
on except calendar synchronization. These are preferences only; no email, SMS,
push notification, newsletter job, or Google Calendar connection is created.

Phone notifications mean SMS. Switching the SMS or email master off disables and
greys out only the corresponding channel's child controls. Their saved choices
are preserved, then become editable again when their master is turned back on.
Calendar synchronization is an independent saved preference.

Notification contacts are read directly from the user's Account Information on
each load/save. There are no separate notification email/phone fields to keep in
sync. The screen displays the current contacts as read-only and links to Account
Information for changes. Each settings page has loading, retry, save, and feedback
states and an explicit Save Changes button.

## Signup validation

Required first name, last name, username, and email checks treat whitespace-only
input as empty. Usernames allow 1 to 25 ASCII letters/numbers. Email syntax and
the existing 15-to-128-Unicode-character password rule are checked on the device
and backend. Password spaces are preserved. Errors appear beside their labels.

An advisory, debounced username availability lookup displays "Username already
exists." when appropriate. The final insert still enforces the unique database
index, so simultaneous signups cannot bypass it. Closed accounts' usernames stay
reserved. Email duplicate errors also appear on the email field.

## API

- `GET /api/event-selections`
- `PUT /api/event-selections/:eventId`
- `GET /api/event-selections/history`
- `GET /api/event-selections/history/:id`
- `GET /api/settings/preferences`
- `PATCH /api/settings/preferences`
- `GET /api/settings/cities?q=...`
- `GET /api/settings/notifications`
- `PATCH /api/settings/notifications`
- `GET /api/auth/username-availability?username=...`

Private routes derive ownership from the authenticated session. Preference,
notification, and event-choice writes all preserve the existing permanent
account-closure guards. Collections/indexes initialize through normal application
use; no data import or account migration was run.

## Changed files

Modified:

- `backend/src/index.js`
- `backend/src/routes/auth.js`
- `mobile/src/api/client.ts`
- `mobile/src/api/events.ts`
- `mobile/src/components/AppTextInput.tsx`
- `mobile/src/context/EventsContext.tsx`
- `mobile/src/navigation/AppNavigator.tsx`
- `mobile/src/screens/auth/SignupScreen.tsx`
- `mobile/src/screens/event/EventDetailsScreen.tsx`
- `mobile/src/screens/event/MyEventsScreen.tsx`
- `mobile/src/screens/settings/BookingHistoryScreen.tsx`
- `mobile/src/screens/settings/NotificationsScreen.tsx`
- `mobile/src/screens/settings/PreferencesScreen.tsx`
- `mobile/src/screens/settings/SettingsScreen.tsx`
- `mobile/src/screens/settings/UserProfileScreen.tsx`

Added:

- `backend/src/models/EventSelection.js`
- `backend/src/models/NotificationSettings.js`
- `backend/src/models/UserPreferences.js`
- `backend/src/routes/eventSelections.js`
- `backend/src/routes/settings.js`
- `backend/src/services/cityPreferences.js`
- `mobile/src/api/settings.ts`
- `mobile/src/screens/settings/BookingHistoryDetailsScreen.tsx`
- `docs/settings-booking.md`

Removed:

- `mobile/src/screens/settings/LocationScreen.tsx`

No tests, type checks, lint, app launches, API calls, or database calls were run,
as requested. Source and diffs were reviewed only. Restart the backend and reload
the app before manual testing.
