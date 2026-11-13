# Form feedback, event presentation, host totals, and category demos

Current status: a subsequent approved [venue/category/date update](real-venues-categories-and-dates.md)
converted event categories to arrays, replaced fictional demo locations with real
verified venues, and standardized full-date display. The import record below
describes the original batch before those later metadata changes.

Implemented after the user approved the scope and selected three existing host
accounts. Application verification remains manual; no automated application
tests, type checks, syntax checks, app launches, or HTTP functionality checks ran.

## Form feedback

Field-specific errors use the shared FieldError component immediately below their
input, including password visibility rows and masked account inputs. Local checks
run when the field loses focus; editing does not run validation. Existing submit
checks still protect incomplete/invalid submissions. Loaded account values do
not immediately show validation errors.

Username availability runs on Username blur, with cancellation and revision guards
against stale responses. Credential and MFA verification remain explicit server
actions, so leaving a field does not consume an authentication attempt. Existing
password rules, masks, cooldowns, session rotation, and secret clearing remain.

Event/store inputs use blur or the equivalent picker/selection completion.
Date/time validation retains full years, future starts, overnight events, real
DST elapsed time, and the thirty-minute minimum. Prices retain cents; an existing
paid event is not parsed as free during editing. Store hours retain one interval
per weekday and allow overnight closing. Field errors from submissions appear
at their corresponding controls; network/session failures remain form statuses.

## Event presentation and host totals

Interested and Attending share one row without changing their independent saved
flags. Shared event cards and Home tiles show the ticket price on a new line below
the date, in colors.primary, matching the detail page.

The host screens previously counted the host's own Interested flag, yielding
zero or one rather than an audience total. Event responses now include computed
interestedCount and attendingCount. The eventAudienceService groups saved
EventSelections per event/account and excludes missing or closed accounts. Only
totals are returned; no attendee identities or denormalized counters are added.

Host dashboard/details reload totals on focus, pull-to-refresh/retry, app resume,
and successful selection saves. Request/version guards reject stale responses.
These are refreshed database totals, not a real-time push subscription. The
placeholder local view metric was replaced by the actual attendance total.

## Completed additive import

Completed November 12, 2026, at approximately 4:44 p.m. Eastern
(`2026-11-12T21:44:46.174Z`), with a confirmed transaction commit.

| Category | New events |
| --- | ---: |
| Music | 10 |
| Dance | 10 |
| Food | 10 |
| Film | 10 |
| Workshop | 10 |
| Art | 10 |

| Approved owner ID | New events |
| --- | ---: |
| 6ae7814e7d5f88664b48dc90 | 20 |
| 6ae7ad81d75d3755e55f82d3 | 20 |
| 6aeb4f6c9b286ace01de1aea | 20 |

Dates range from November 14, 2026 through January 12, 2027. The events and venues
are marked fictional demos, in the same example New York area as existing demos.
Thirty real Pexels stock photographs illustrate the six categories. They are
reused in pairs across sixty events, producing 120 EventPhotos records, with the
first photo as cover. They illustrate categories rather than documenting actual
events. Each JPEG is within the existing 1 MiB photo limit.

[photos.json](../backend/scripts/fixtures/category-demo/photos.json) records every
original photo page/photographer credit link, download URL, license URL, and SHA-256
checksum. The source license is [Pexels](https://www.pexels.com/license/).

The import used native insert-only operations in eventList and EventPhotos.
Stable IDs/seed keys prevent duplicate imports; existing seeded records and edited
photos are skipped without repair or overwrite. Fixture schemas, future dates,
owners, JPEG payloads/checksums, and existing unique indexes were verified before
the fresh private BSON backup and transaction. These were operational data-safety
checks, not application tests.

All fifteen collections and their indexes/options were preserved. Every
pre-existing document remained unchanged. eventList grew from 19 to 79 records;
EventPhotos grew from 18 to 138. No account fields or other collections were written.

The verified backup and
[category-events-import-report.json](../backend/.local-backups/category-events-import-2026-11-12T21-44-40-726Z-ce5b0170-ddcc-458d-a903-1bbb720d222f/category-events-import-report.json)
are under:

`backend/.local-backups/category-events-import-2026-11-12T21-44-40-726Z-ce5b0170-ddcc-458d-a903-1bbb720d222f/`

Backups contain sensitive account data and remain Git-ignored with restrictive
permissions. The photo fixtures contain only public stock photographs/credits.
The historical split copier remains retired. The category importer safely rejects
expired fixture dates on a later run rather than renewing or overwriting events.

## File inventory

| Area | Files | Change |
| --- | --- | --- |
| Shared feedback | [FieldError.tsx](../mobile/src/components/FieldError.tsx), [AppTextInput.tsx](../mobile/src/components/AppTextInput.tsx) | Consistent accessible feedback under controls. |
| Auth forms | [SignupScreen.tsx](../mobile/src/screens/auth/SignupScreen.tsx), [LoginScreen.tsx](../mobile/src/screens/auth/LoginScreen.tsx) | Blur checks, username lookup, and field-specific submit feedback. |
| Account/security | [AccountScreen.tsx](../mobile/src/screens/settings/AccountScreen.tsx), [SecurityScreen.tsx](../mobile/src/screens/settings/SecurityScreen.tsx) | Blur-only editing feedback below fields; existing security behavior retained. |
| Host forms | [CreateEventScreen.tsx](../mobile/src/screens/host/CreateEventScreen.tsx), [EditEventScreen.tsx](../mobile/src/screens/host/EditEventScreen.tsx), [CreateStoreScreen.tsx](../mobile/src/screens/host/CreateStoreScreen.tsx) | Field-level feedback, schedule/price/hours checks, and error mapping. |
| New host validation helper | [hostFormUtils.ts](../mobile/src/screens/host/hostFormUtils.ts) | Shared event/store draft validation and response-to-field mapping. |
| Host inputs | [PriceInputField.tsx](../mobile/src/components/PriceInputField.tsx), [DatePickerField.tsx](../mobile/src/components/DatePickerField.tsx), [TimePickerField.tsx](../mobile/src/components/TimePickerField.tsx), [BusinessHoursEditor.tsx](../mobile/src/components/BusinessHoursEditor.tsx) | Error and field-exit/picker-completion callbacks. |
| Location/photos | [LocationInputField.tsx](../mobile/src/components/LocationInputField.tsx), [PhotoPickerField.tsx](../mobile/src/components/PhotoPickerField.tsx), [maps.ts](../mobile/src/api/maps.ts) | Feedback beneath controls and lookup/selection handling. |
| Card/detail layout | [EventCard.tsx](../mobile/src/components/EventCard.tsx), [HomeScreen.tsx](../mobile/src/screens/event/HomeScreen.tsx), [EventDetailsScreen.tsx](../mobile/src/screens/event/EventDetailsScreen.tsx) | Price placement/color and same-row selection buttons. |
| New audience service | [eventAudienceService.js](../backend/src/services/eventAudienceService.js) | Aggregate-only interested/attending totals from active accounts. |
| Event responses | [eventService.js](../backend/src/services/eventService.js), [eventData.js](../backend/src/services/eventData.js), [eventController.js](../backend/src/controllers/eventController.js) | Include batch-loaded totals and prevent stale response caching. |
| Mobile event loading | [events.ts](../mobile/src/api/events.ts), [EventItem](../mobile/src/data/events.ts), [EventsContext.tsx](../mobile/src/context/EventsContext.tsx), [AppNavigator.tsx](../mobile/src/navigation/AppNavigator.tsx) | Count fields, abortable detail reads, and refresh/race handling. |
| Host totals UI | [EventHostScreen.tsx](../mobile/src/screens/host/EventHostScreen.tsx), [EventHostDetailsScreen.tsx](../mobile/src/screens/host/EventHostDetailsScreen.tsx) | Real totals, focus/pull refresh, and count-loading feedback. |
| New import tools | [downloadCategoryPhotos.js](../backend/scripts/downloadCategoryPhotos.js), [seedCategoryEvents.js](../backend/scripts/seedCategoryEvents.js) | Prepare checked JPEG assets and perform guarded additive import. |
| Backup helpers | [cleanupLegacySplitFields.js](../backend/scripts/cleanupLegacySplitFields.js) | Export native backup helpers without executing cleanup; allowlisted import backup prefix. |
| New fixtures | [events.json](../backend/scripts/fixtures/category-demo/events.json), [photos.json](../backend/scripts/fixtures/category-demo/photos.json), backend/scripts/fixtures/category-demo/photos/*.jpg | Sixty events, thirty attributed photographs, and checksums. |
| New record | [event-ui-validation-and-demo-import.md](event-ui-validation-and-demo-import.md) | Scope, import results, backup link, and this file inventory. |

Restart the backend and reload the mobile app to use the changed responses and
screens. Manually check empty/invalid field exit, correcting values, photo/location
feedback, paid-event editing, all six categories, and toggling a selection as one
account before refreshing the corresponding host dashboard in another account.
