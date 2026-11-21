# Community accounts, host history, and truthful notifications

> Maintenance update — November 21, 2026: the one-time population/repair tools,
> fixtures, and source photos described here have been retired. Their commands
> and file inventory below are historical. Existing MongoDB accounts, events,
> media, selections, ratings, and notifications remain unchanged. See the
> [repository cleanup](repository-cleanup-2026-11-21.md).

This update adds **50 demo accounts total**, shared across all events and hosts. It also separates host event lists into Active/Completed views, compacts event cards, and replaces the old synthetic notification previews with source-backed records.

The added events, selections, ratings, and notifications are normal persisted app records. They use the existing app's venues and media; they are not claims about independently verified public listings. Added content has no Test/Demo wording in the app. Internal seed identifiers exist only for safe repeat runs.

## Demo data

- Reserved accounts are `nearmecommunity001` through `nearmecommunity050`, with `@example.invalid` email addresses and deterministic IDs. Reruns reuse those same 50 identities; an occupied/renamed/closed reserved identity is rejected rather than adopted.
- They have normal names/bios and split profile/security records. Password hashes use discarded random secrets; no common login password is created or disclosed by this population tool.
- Every existing active account that hosts events has at least **five noncancelled completed events** after population. Missing history is added as seeded historical events using existing venue/media data. Existing real accounts, events, selections, and ratings are preserved.
- Demo users receive varied selections across eligible events; each user does not join every event. Ratings require attendance at an ended, noncancelled event, exclude the event's host, and remain unique per user/event.
- Future reminders follow the real event/deadline schedule. The import does not start notification workers or contact external providers.

## Mobile behavior

- Shared horizontal event cards have a **128dp height at normal font scale**, with a uniform larger height when accessibility text is enlarged. Smaller padding/gaps, a taller cover image, single-line titles/venues, limited category chips with `+N`, and a shared counts/friends footer keep each card compact. The full text remains available through the accessible summary and details page.
- Ticket prices remain on their own blue-purple line beneath date/time. Cancelled events are explicitly labeled.
- The host's **Your Events** section defaults to Active and offers Active/Completed filters with counts. Events move to Completed at their end instant; active events sort by start time and completed events by most recent end time. Focus/foreground and a focused-screen clock keep the partition current.
- Retained cancelled events remain visible in the corresponding date group with their cancellation badge. They are not eligible for demo ratings or counted toward the five-completed-event minimum.
- Dashboard revenue calculations and shared store-cache/error/retry behavior remain intact.

## Notification correction

The refresh audits existing notifications against actual accounts, selections, events, ratings, invitations, and recorded source occurrences. Unsupported synthetic previews are removed/replaced with legitimate notifications. Timed reminders are based on the actual trigger instant and event schedule; historical reminder text identifies its recorded schedule rather than pretending that the event is still 24 hours or one hour away. No event cancellation, location change, or other occurrence is invented just to fill a notification type.

All retained/generated notifications are reset to **unread**. Before applying correction, the coordinator saves existing notifications, jobs, deliveries, and event selections in a private snapshot under the ignored `backend/.local-backups/` directory. It does not copy account credentials/contact records into that snapshot. Email/SMS/push provider delivery stays disabled for the admin operation.

Patrick, Joshua, and Demi receive normal registrations at existing upcoming events so their confirmations are backed by actual attendance choices. Existing interest flags and already-attending selections are preserved. New inbox backfills respect per-user/type notification preferences.

The old `seedNotificationInboxes.js` factory is retired: its compatibility entry point now runs the same notification-only preview/repair rather than generating ten synthetic types per user.

## Admin command

Run from `backend`. Preview is the default and performs no application-record writes:

```powershell
node scripts/refreshDemoCommunity.js
node scripts/refreshDemoCommunity.js --apply
```

For notification correction without community population:

```powershell
node scripts/refreshDemoCommunity.js --notifications-only
node scripts/refreshDemoCommunity.js --notifications-only --apply
```

The apply command produces a private run report alongside its notification snapshot. It prints counts and results without MongoDB credentials or raw private records.

`--community-only` can apply the account/event/selection/rating and recipient-registration phase without notification correction. It cannot be combined with `--notifications-only`.

## Changed files

| File | Responsibility |
| --- | --- |
| [mobile/src/components/EventCard.tsx](../mobile/src/components/EventCard.tsx) | Compact, consistently sized cards, canonical counts/price, cancellation badge, accessible summary. |
| [mobile/src/components/FriendAvatarStack.tsx](../mobile/src/components/FriendAvatarStack.tsx) | Compact avatar/count variant for card footers. |
| [mobile/src/screens/host/EventHostScreen.tsx](../mobile/src/screens/host/EventHostScreen.tsx) | Active/Completed filters, ordering, counts, and time transitions. |
| [backend/scripts/refreshDemoCommunity.js](../backend/scripts/refreshDemoCommunity.js) | CLI configuration, preview/apply coordination, private snapshots, and reporting. |
| [backend/src/services/demoCommunityService.js](../backend/src/services/demoCommunityService.js) | Idempotent demo identities, completed-event history, varied selections, and eligible ratings. |
| [backend/src/services/notifications/repairService.js](../backend/src/services/notifications/repairService.js) | Source validation, truthful notification correction/replacement, queue handling, and unread reset. |
| [backend/src/services/notifications/templates.js](../backend/src/services/notifications/templates.js) | Neutral reminder headings and explicit schedule dates that remain accurate when opened later. |
| [backend/scripts/seedNotificationInboxes.js](../backend/scripts/seedNotificationInboxes.js) | Retired synthetic factory; delegates to notification-only repair. |
| [This document](demo-community-and-host-history.md) | Usage, behavior, file inventory, and run results. |

## Verification and application results

- Mobile TypeScript compilation passed.
- Android JavaScript/Hermes export passed (1,372 modules and 54 assets).
- Changed Node source/admin entry points pass syntax checks. The authorized apply completed on November 15, 2026; read-only verification confirms another immediate run would add no accounts, events, selections, ratings, registrations, or notification corrections.
- Integrity audit reports no duplicate keys/friendship pairs, missing profile/security records, legacy inline fields, or orphaned event owners.
- Manual UI tests and a functional test suite were not run, as requested by the user. No external-provider sends are part of this operation.

| Applied data | Result |
| --- | --- |
| New accounts/profiles/security records | 50 of each; 63 total accounts |
| Completed events added | 12; 91 total events |
| Event photos added | 20; 158 total photos |
| Community selections added | 2,370 |
| Eligible ratings added | 416; all 50 new accounts have rated completed attendance |
| Patrick/Joshua/Demi registrations | Two upcoming events each; six new normal registrations |
| Event selections after apply | 2,393 |
| Unsupported old test notifications removed | 30, with original state privately backed up |
| Truthful in-app notifications after apply | 1,308; all reset unread at completion |
| Patrick/Joshua/Demi inboxes | Two valid registration confirmations each |
| Stale queued jobs skipped | Three |
| External deliveries created/sent by this operation | Zero |

Completed events by existing host: `hollow12` (Patrick) **15**, `demiberry` (Demi) **5**, `Joshua` **5**, and `alicetest` **5**. Existing event schedules, venues, photos, original credentials, and ratings were preserved. Original event choices were retained; the six requested upcoming registrations were added through the normal selection service.

Future 24-hour/one-hour/registration-deadline reminders remain queued for their actual schedule anchors; they are not inserted early to populate the inbox. New confirmations observe notification settings. Read status may change normally after users open notifications.
