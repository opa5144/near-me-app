# Merge resolution: November 15, 2026

Resolved the pull of `a22ad35` into `47a20b2`. The incoming change touches eight mobile files and adds shared user-data caching, richer profile/host information, and avatar fallbacks. Five files conflicted with the previous notification/friendship/rating merge. Both sets of behavior are retained where supported by the current API.

## Files

| File | Change |
| --- | --- |
| [mobile/src/context/UserDataContext.tsx](../mobile/src/context/UserDataContext.tsx) | Incoming new provider: shares typed profile, friendship, attended-history, and store data. Coalesces reads, keeps a 30-second freshness window, supports forced refresh, and exposes loading/errors/retry. Version and abort guards prevent older reads from replacing saved/current values. |
| [mobile/src/navigation/AppNavigator.tsx](../mobile/src/navigation/AppNavigator.tsx) | Resolves the provider conflict by retaining both user-data and notification providers inside the authenticated navigator. Preserves notification/rating routes, incoming eager tab mounting, and refresh after store creation. Logout unmounts the private caches. |
| [mobile/src/screens/event/EventDetailsScreen.tsx](../mobile/src/screens/event/EventDetailsScreen.tsx) | Combines richer host names/avatars and public-profile event lists with the shared cache. Preserves rating eligibility, cancellation/end/deadline guards, actual attending friends, invitations, maps/calendar, and cents. Host identity is matched by its database ID. |
| [mobile/src/screens/host/EventHostScreen.tsx](../mobile/src/screens/host/EventHostScreen.tsx) | Uses shared store data with focus refresh, loading/error feedback and explicit retry. Retains cents-based revenue estimates and the actual upcoming-event count. Keeps cached content visible during refresh. |
| [mobile/src/screens/settings/PublicProfileScreen.tsx](../mobile/src/screens/settings/PublicProfileScreen.tsx) | Combines incoming host/profile sections with independent Follow and typed friendship actions. Hosted events match the target's host ID; interested/attended sections require confirmed selection IDs rather than treating unrelated events as the target's activity. |
| [mobile/src/screens/settings/UserProfileScreen.tsx](../mobile/src/screens/settings/UserProfileScreen.tsx) | Uses shared profile/friends/history data while retaining the real notification inbox, unread count, request-ID handling, visible errors, and retry/action guards. |
| [mobile/src/screens/settings/AccountScreen.tsx](../mobile/src/screens/settings/AccountScreen.tsx) | Updates the shared profile from the successful saved server response even if the account page has lost focus. Retains existing validation, masks, and input/save behavior. |
| [mobile/src/components/FriendAvatarStack.tsx](../mobile/src/components/FriendAvatarStack.tsx) | Retains the incoming default-avatar fallback using the canonical typed friend avatar field. |
| [This report](merge-resolution-2026-11-15.md) | Records the resolution, changed files, and verification scope. |

## Important decisions

- User-data caching and notifications are separate providers; neither replaces the other.
- A completed account save invalidates older profile reads before publishing its saved response to the cache.
- Friendship actions continue to use real Friendship request IDs and server-returned state. Organizer following remains independent of friendship.
- The host dashboard keeps precise ticket values and actual upcoming-event counts; it does not reintroduce the earlier rounded revenue or unsupported conversion-rate calculation.
- The public event list does not establish another user's interested/attended selections. New profile sections use confirmed data and explain when that information is unavailable.
- Existing notification/rating/invitation backend rules remain authoritative. No backend source, MongoDB records, provider configuration, or credentials were changed for this pull.

## Verification

- Mobile TypeScript compilation passes (`npx.cmd --no-install tsc --noEmit`).
- Android JavaScript/Hermes export passes (1,372 modules, 54 assets). Generated output is ignored under `mobile/.expo/codex-merge-check-2026-11-15`.
- All five source conflicts are resolved; no conflict markers remain in mobile source. The eight reviewed mobile files and this report are staged, and the staged patch passes Git's whitespace check.

No functional test suite, running-app actions, backend startup, API requests, or database operations were performed for this merge. This pull changes no native configuration or dependencies; the earlier native Android build result is documented in the [November 14 report](merge-resolution-2026-11-14.md).

No commit was created. Git retains the merge in progress with its conflicts resolved, ready for review/commit.
