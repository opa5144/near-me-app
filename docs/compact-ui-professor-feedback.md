# Compact UI changes from professor feedback

Implemented November 21, 2026. This change reduces vertical space in event lists,
friend profiles, ratings, stores, detail screens, and My Itinerary.

## Resulting layout

- Event prices sit at the upper right beside the title, retaining the primary
  blue-purple color. List rows use 80-by-80 square covers and a 108-point baseline
  height instead of 128. All rows expand consistently for larger system text.
- Home reuses the shared compact event card for Your Next Event and Top Picks.
  Friend profiles and other event lists inherit the same square thumbnails.
- Store list rows share the event row's size, padding, gaps, and image dimensions.
  The host dashboard now uses the shared store card instead of a separate layout.
- Event and host details show the title/price immediately after the photo, followed
  by tighter categories, dates, location, and action spacing. Detail photo headers
  are 180 points high instead of 220. Gallery thumbnails are 64-by-64 squares in
  one horizontally scrollable row; full-screen viewing and photo paging remain.
- Five event-rating emojis and host feedback counts occupy one compact row. On
  narrow screens or with larger system text, the row scrolls horizontally rather
  than wrapping or clipping the full labels. Profile shortcut tiles have a
  72-point minimum height instead of a fixed 105-point height.
- Store details use tighter sections and business-hour rows. My Itinerary has a
  shorter planning panel, smaller date headers and gaps, and no separate repeated
  event-time line above each card.

## Modified files

| File | Summary |
| --- | --- |
| [EventCard.tsx](../mobile/src/components/EventCard.tsx) | Price beside title, square covers, shorter rows, narrower Mine column. |
| [HomeScreen.tsx](../mobile/src/screens/event/HomeScreen.tsx) | Shared event cards replace larger custom next-event and Top Picks layouts. |
| [EventDetailsScreen.tsx](../mobile/src/screens/event/EventDetailsScreen.tsx) | Raise title and event information; tighten gaps, categories, and actions. |
| [EventHostDetailsScreen.tsx](../mobile/src/screens/host/EventHostDetailsScreen.tsx) | Matching compact detail spacing and metrics; title before categories/metrics. |
| [PhotoCollection.tsx](../mobile/src/components/PhotoCollection.tsx) | Shorter detail photo header and one row of square gallery thumbnails. |
| [FriendAvatarStack.tsx](../mobile/src/components/FriendAvatarStack.tsx) | Smaller avatars, padding, and bottom margin. |
| [EventRatingForm.tsx](../mobile/src/components/EventRatingForm.tsx) | Five smaller rating choices in one responsive row. |
| [EventRatingSummary.tsx](../mobile/src/components/EventRatingSummary.tsx) | Matching five-choice count row and compact heading/total. |
| [UserProfileScreen.tsx](../mobile/src/screens/settings/UserProfileScreen.tsx) | Shorter shortcut tiles, smaller icons/avatars, and tighter profile/modal spacing. |
| [PublicProfileScreen.tsx](../mobile/src/screens/settings/PublicProfileScreen.tsx) | Smaller profile header/metrics/tabs and optional embedded-modal padding. |
| [StoreCard.tsx](../mobile/src/components/StoreCard.tsx) | Match shared event-row sizing and spacing; full screen-reader summary. |
| [EventHostScreen.tsx](../mobile/src/screens/host/EventHostScreen.tsx) | Reuse the shared store card in the dashboard and remove its duplicate layout. |
| [StoreDetailsScreen.tsx](../mobile/src/screens/host/StoreDetailsScreen.tsx) | Match detail-page gutters and tighten section/hour spacing. |
| [ItineraryScreen.tsx](../mobile/src/screens/event/ItineraryScreen.tsx) | Compact planning controls and timeline; remove duplicate time display. |

This document was created as the change inventory. No backend files, database
records, authentication behavior, or notification/calendar integrations changed.
Existing image fallbacks, private draft media, event availability filtering,
ratings rules, and planning actions were retained.

## Checks

- `npx.cmd --no-install tsc --noEmit` passed.
- `git diff --check` passed.
- No automated functional tests, app startup, or mobile UI flows were run, in
  keeping with the user's preference to manually check the app.

Reload the mobile app and manually inspect Search (including Mine), friend
profiles, Home, store results/details, My Itinerary, and completed-event ratings
at the phone's normal and larger system text sizes.
