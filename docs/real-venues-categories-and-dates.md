# Real demo venues, multiple categories, date display, and growing bio

The user approved code and database updates after confirming that venues and
addresses should be real while event titles, dates, programs, and prices remain
demo data. No actual venue booking, event listing, or endorsement is implied.

## Event categories

The eventList collection's canonical field is now categories: an ordered array of one to six
distinct choices from Music, Dance, Food, Film, Workshop, and Art. The supported
names live in backend/src/constants/eventCategories.js and are shared by model,
input parsing, and preference defaults. Existing preference selections and Store
category arrays retain their meaning and stored values.

New event requests send categories[]. The backend accepts category only as an
older-request bridge when categories is omitted; an explicit invalid array is
never hidden by that bridge. Responses provide the complete array and a temporary
category:first response alias for older mobile builds. Existing stored category
fields were removed by the migration, not copied back by this alias.

Create/Edit Event toggle multiple chips and require at least one. Search matches
any selected category and includes all category names in text search. All clears
the selected filters. Cards, both detail views, and booking history display every
category. Existing events retain their original category as a singleton array;
users can add more through editing without an automatic retag of existing data.

## Date presentation and bio

User-facing full dates now use MM/DD/YYYY: list cards, Home, details, booking
history, shares, selected picker dates, overnight end labels, and date of birth.
For example, a November 14 event displays 11/14/2026. A shared mobile helper
formats dates without locale-dependent slash parsing and respects event timezone.

BSON startsAt/endsAt, API timestamps, calendar picker keys, and stored DOB values
keep their canonical formats. DOB masks/input display MM/DD/YYYY and convert
explicitly to/from YYYY-MM-DD at the account API boundary. Real-date, leap-year,
future-date, blank-clearing, and existing blur/submit safeguards remain. No DOB
records were rewritten for this presentation change.

Category/metadata-only edits preserve the original event timezone when the two
event instants remain unchanged. Actual schedule edits retain the existing
device-clock/device-timezone behavior, identified by the editor's timezone label.

Bio remains a multiline input with its existing 2,000-character limit. Native
content-size events grow and shrink its height from a ninety-pixel minimum;
internal scrolling is disabled so the surrounding page scrolls naturally. Errors
remain below the field and validation remains on exit/submission.

## Verified venues and Maps

All twelve venue names/addresses were checked against their official pages and
resolved through Google Places into real place IDs and coordinates. The fixture
records the official source, Google's resolved name/address, and verification
date. Google IDs/coordinates were obtained directly; none were invented.

| Venue | Address | Official source |
| --- | --- | --- |
| The Bowery Ballroom | 6 Delancey Street, New York, NY 10002 | [Venue info](https://mercuryeastpresents.com/boweryballroom/venue-info/) |
| Brooklyn Steel | 319 Frost Street, Brooklyn, NY 11222 | [Venue page](https://www.bowerypresents.com/brooklyn-steel/) |
| The Ailey Studios | 405 West 55th Street, New York, NY 10019 | [Contact](https://ailey.org/contact) |
| Broadway Dance Center | 322 West 45th Street, New York, NY 10036 | [Directions](https://broadwaydancecenter.com/about/hours-directions) |
| Chelsea Market | 75 Ninth Avenue, New York, NY 10011 | [Visit](https://www.chelseamarket.com/visit) |
| Essex Market | 88 Essex Street, New York, NY 10002 | [Visit](https://www.essexmarket.nyc/visit) |
| IFC Center | 323 Sixth Avenue, New York, NY 10014 | [Directions](https://www.ifccenter.com/map-directions/) |
| Film Forum | 209 West Houston Street, New York, NY 10014 | [Directions](https://filmforum.org/map_directions) |
| Greenwich House Pottery West Village | 16 Jones Street, New York, NY 10014 | [Contact](https://greenwichhouse.org/pottery/about/contact/) |
| Greenwich House Pottery Chelsea | 80 Eighth Avenue, 6th Floor, Suite 601, New York, NY 10011 | [Contact](https://greenwichhouse.org/pottery/about/contact/) |
| Whitney Museum of American Art | 99 Gansevoort Street, New York, NY 10014 | [Visit](https://whitney.org/Visit) |
| The Museum of Modern Art | 11 West 53rd Street, New York, NY 10019 | [Visit](https://www.moma.org/visit/) |

Both event detail screens use one Google Maps opener. It constructs the supported
HTTPS search URL with api=1, an encoded name/address query, and query_place_id
when available. Coordinates are a fallback when no address is present. This
avoids custom-scheme probing and targets the saved venue rather than a similarly
named search result. Failures appear below the location action. See
[Google's Maps URL guide](https://developers.google.com/maps/documentation/urls/get-started).

The existing real stock photos remain category illustrations, not photos claiming
to document these demo bookings. The sixty newer demo notices were corrected to
say the venue/address are real while the event itself remains fictional.

## Completed migration

Completed 11/12/2026 at approximately 5:16 p.m. Eastern
(`2026-11-12T22:16:10.045Z`), with a confirmed transaction commit:

| Operation | Events |
| --- | ---: |
| Converted to categories arrays and removed stored category | 79 |
| Replaced explicitly mapped fictional demo venues | 74 |
| Corrected the exact stale venue/address disclaimer | 60 |
| Preserved manually created venue details | 5 |

The native migration wrote only eventList. All fifteen collections, record counts,
IDs, ownership, photos, selections, schedules, timestamps, and indexes/options
were preserved apart from the approved categories/location/notice changes. The
138 EventPhotos and 13 EventSelections records remained unchanged. Account,
security, profile, store, and preference records were unchanged.

Before writing, a fresh private BSON backup of every collection was flushed,
read back, decoded, and fingerprint-verified. The transaction rechecked exact
preimages, fixture selectors, and expected transformations. Post-commit canonical
BSON plus protected-field fingerprints and metadata checks all passed.

The backup and verified
[event-categories-venues-report.json](../backend/.local-backups/event-categories-venues-2026-11-12T22-15-56-443Z-d71dd3dc-9a52-4435-b7d8-c9732f8366b8/event-categories-venues-report.json)
are under:

`backend/.local-backups/event-categories-venues-2026-11-12T22-15-56-443Z-d71dd3dc-9a52-4435-b7d8-c9732f8366b8/`

Backups remain Git-ignored with restrictive access permissions and contain sensitive data.
No environment file or API key was exported. The venue fixture contains public
place information only.

The migration accepts only explicit demo assignments. It refuses a seeded venue
that was subsequently edited to a different real address. Already-applied values
are no-ops. Category import seed/photo IDs remain stable, and rerunning the
separate importer still skips existing seeds rather than overwriting them.

## Files in this update

| Area | Files | Summary |
| --- | --- | --- |
| New category constant | [eventCategories.js](../backend/src/constants/eventCategories.js) | Supported backend category names. |
| Backend | [Event.js](../backend/src/models/Event.js), [eventData.js](../backend/src/services/eventData.js), [settingsService.js](../backend/src/services/settingsService.js) | Array schema/validation, compatible serialization, date labels, and preference defaults. |
| New migration/preparation scripts | [migrateEventCategoriesAndVenues.js](../backend/scripts/migrateEventCategoriesAndVenues.js), [resolveDemoVenues.js](../backend/scripts/resolveDemoVenues.js) | Guarded transactional migration and Google venue resolution. |
| Existing scripts | [seedCategoryEvents.js](../backend/scripts/seedCategoryEvents.js), [cleanupLegacySplitFields.js](../backend/scripts/cleanupLegacySplitFields.js) | Array/place-ID fixture support and allowlisted backup metadata/prefix. |
| Fixtures | [New venues.json](../backend/scripts/fixtures/category-demo/venues.json), [updated events.json](../backend/scripts/fixtures/category-demo/events.json) | Twelve sourced venues, seventy-four selectors, and current sixty-event fixture metadata. |
| Mobile contracts | [data/events.ts](../mobile/src/data/events.ts), [api/events.ts](../mobile/src/api/events.ts) | Canonical category arrays, typed location/timezone fields, and API-boundary compatibility normalization. |
| New mobile helpers | [dateFormat.ts](../mobile/src/utils/dateFormat.ts), [eventMaps.ts](../mobile/src/utils/eventMaps.ts) | Date formatting/parsing and shared place-ID-aware Maps opening. |
| Event forms | [CreateEventScreen.tsx](../mobile/src/screens/host/CreateEventScreen.tsx), [EditEventScreen.tsx](../mobile/src/screens/host/EditEventScreen.tsx), [hostFormUtils.ts](../mobile/src/screens/host/hostFormUtils.ts) | Multi-select categories, validation, numeric date labels, and metadata-edit timezone preservation. |
| Search | [SearchScreen.tsx](../mobile/src/screens/event/SearchScreen.tsx), [CategoryFilter.tsx](../mobile/src/components/CategoryFilter.tsx) | ANY-category matching and All reset. |
| Event display | [EventCard.tsx](../mobile/src/components/EventCard.tsx), [EventDetailsScreen.tsx](../mobile/src/screens/event/EventDetailsScreen.tsx), [EventHostDetailsScreen.tsx](../mobile/src/screens/host/EventHostDetailsScreen.tsx), [BookingHistoryDetailsScreen.tsx](../mobile/src/screens/settings/BookingHistoryDetailsScreen.tsx), [DatePickerField.tsx](../mobile/src/components/DatePickerField.tsx) | Every category, formatted full dates, and Maps actions. |
| Account | [AccountScreen.tsx](../mobile/src/screens/settings/AccountScreen.tsx), [AccountMaskedInput.tsx](../mobile/src/screens/settings/AccountMaskedInput.tsx) | DOB display/API conversion and content-driven bio height. |
| Documentation | [real-venues-categories-and-dates.md](real-venues-categories-and-dates.md), [eventList-connection.md](eventList-connection.md), [prior import record](event-ui-validation-and-demo-import.md) | Current contracts, venue sources, results, and file inventory. |

Source review and authorized venue/data operations were performed. No application
tests, type checks, syntax checks, app launches, or HTTP functionality checks ran.
Restart the backend and reload the mobile app, then manually verify category
selection/search, date labels and DOB entry, bio growth/shrink, and venue Maps taps.
