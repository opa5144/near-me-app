# Pull review: friendship/invites versus notifications/ratings

This is the original, pre-resolution review. The later fixes and file inventory are recorded in [Merge resolution: November 14, 2026](merge-resolution-2026-11-14.md); conflict and verification statements below describe the earlier review, not the repaired working tree.

Reviewed the in-progress merge of incoming `8f0d47a` into local `5c83ce6` on November 14, 2026. The incoming branch changes 26 paths relative to the shared merge base: 19 are staged by Git and 7 are unresolved. This is an unfinished merge, not a completed pull.

This review did not resolve conflicts, stage files, commit, install dependencies, or run tests, syntax checks, app/server starts, or API functionality calls. The separate approved notification seed reads/writes Atlas; its scope is documented below.

## Findings

1. **Blocker: seven files still contain merge conflict markers.** JavaScript/TypeScript cannot load those files in this state. They are `backend/src/controllers/eventController.js`, `backend/src/routes/events.js`, and the mobile EventDetails, Home, EventHostDetails, PublicProfile, and UserProfile screens. References below use the current conflicted files' line numbers.

2. **P1: the incoming invite endpoints use the wrong authentication contract.** `eventInviteController.js:6` and `:43` dereference `req.user`, while `middleware/requireAuth.js:15` supplies `req.userId`, `req.authSessionId`, and `req.authVersion`. Both invite handlers therefore fail before doing their work. The new friend-attendance enrichment in `eventController.js:8`, `:36`, and `:77` has the same mismatch. Public event list/detail routes also attach no authentication, so just renaming that property would still not supply a viewer there.

3. **P1: the pull removes existing friendship write protections.** `friendService.js:114–177` replaces account-fenced transactional writes with direct saves/creates. Requests can involve nonexistent or closed counterpart accounts, and writes can race account closure/security-version changes. Reverse-pair requests also lose their existing serialization. Restore the existing `withActiveAccountWrite`/active-account rules while preserving the new response shape and request-ID fixes.

4. **P1: invite UI can report success without sending anything.** `EventDetailsScreen.tsx:360` and `EventHostDetailsScreen.tsx:240` invoke optional `onInviteFriend` callbacks that `AppNavigator` does not supply. `InviteFriendsModal.tsx:30–33` marks the user invited before awaiting the callback and does not roll back/show a failure. A missing callback is treated as success.

5. **P1: all friends are incorrectly shown as attending an event.** `EventDetailsScreen.tsx:236` passes the complete accepted-friend network to `FriendAvatarStack`. The displayed attending group must come from that event's actual attending selections; the new backend `friendsAttending` result is event-specific, although its authentication problem currently makes it empty.

6. **P1: choosing either merge side wholesale loses working functionality.**
   - `routes/events.js:4–8` needs both the rating-controller import and the invite-controller imports. The corresponding routes from both branches are already present below. Keeping only one import leaves the other identifiers undefined.
   - `eventController.js:132–148` must retain `cancelEvent` and its export. The cancellation route is still registered. Keep the incoming enrichment when resolving the specific hunk, rather than replacing the entire file.
   - `HomeScreen.tsx:6–20` needs the notification bell alongside incoming price helpers.
   - EventDetails needs the rating form and cancellation/end guards alongside friendship/calendar code.
   - EventHostDetails needs `useEffect`, the end timer, `EventRatingSummary`, and `ratingRefreshKey` alongside the incoming invite props/state.
   - `PublicProfileScreen.tsx:176` still references `handleFriendPress`, which the automatic merge removed. Combine the incoming `FriendActionButton`/relationship state with the independent Follow/Unfollow controls; keeping the old button hunk alone is broken.
   - `UserProfileScreen.tsx:16–23` needs notification imports plus `AcceptRequestCard`. Its real inbox/unread/navigation implementation is already retained below the conflict.

7. **P2: expected friendship failures become HTTP 500.** `friendService.js:5` now builds ordinary `Error` instances, while `friendController.js:5`/`controllerUtils.js:14` recognize `ServiceError`. Invalid inputs, unauthorized responses, and duplicate/processed requests no longer retain their intended 400/403/404/409 responses.

8. **P2: stored avatars are replaced with defaults.** `friendService.js:67–70` calls `avatarUrlsForUsers` after removing its import. Its `typeof` guard silently returns an empty avatar map. `friendAttendance.js:23` also reads legacy avatar fields rather than the authoritative `UserAvatars` data and does not filter closed accounts.

9. **P2: blocked relationships are not handled.** `friendService.js:121–146` branches for accepted, pending, and rejected records, but not blocked records. A blocked reverse relationship can become a new pending request, while the same direction can hit a duplicate key.

10. **P2: invites bypass current event/account rules and application layering.** The new invite controller reads/writes models and executes business logic directly instead of calling a service. It does not check event existence, active recipient/host, cancelled/ended state, or the account fence. Its event population asks for obsolete `date`, `time`, `venue`, and `bannerImage` fields instead of canonical dates/place and separate photos.

11. **Integration gap: event invites do not reach the real inbox.** The invite handler stores `EventInvite`, but the notification inbox and unread count read `notifications`. No mobile caller retrieves `/events/invites/me`, and there is no route to accept/decline/read an invite. Storing an invite alone does not create a recipient notification. This is separate from the ten notification types already implemented.

12. **P2: friendship buttons can show stale status and hide failures.** `FriendActionButton.tsx:39–41` always sets `pending_sent`, although `friendService.js:125–129` can accept an existing reverse request and return accepted. Its catch at `:47–53` recognizes only the text "already exists"; current errors use different text, and other failures receive no visible feedback.

13. **P2: price rounding changes event values and estimated revenue.** The incoming whole-price helper rounds display prices before multiplication in `EventHostDetailsScreen.tsx:35–38`. A stored $12.50 ticket with two attendees becomes $26 rather than $25. Use canonical `priceAmount` for calculations and retain cents unless whole-dollar pricing is explicitly required. Similar display helpers appear in Home and EventDetails.

14. **P2: calendar failures are invisible.** EventDetails `:145–160` and EventHostDetails `:112–128` only log native calendar errors. Their web fallback runs for invalid dates, not for a failed native calendar action. `expo-calendar` is newly declared but absent from the inspected local mobile dependency directory; installation/native setup remains necessary and was not run during review.

15. **P2: the incoming friend seed/cleanup is not reversible as written.** `seedFakeFriends.js` reassigns the host of an arbitrary existing event to a fake user. `removeFakeFriends.js` deletes those fake accounts and friendships without restoring that host, leaving an orphaned event owner. The seed also supplies legacy password/avatar fields to the split identity model instead of provisioning the corresponding security/profile/avatar records. Neither script was run by this task.

The new request-ID handling is useful and should be preserved: incoming request items' `requestId` is the Friendship ID, while `id` is the requester's User ID. `AcceptRequestCard` now sends the proper `requestId`.

## Incoming files

| File | Incoming change | Current merge state |
| --- | --- | --- |
| `backend/scripts/removeFakeFriends.js` | New cleanup utility | Staged |
| `backend/scripts/seedFakeFriends.js` | New friend fixture utility | Staged |
| `backend/src/controllers/eventController.js` | Friend-attendance enrichment | **Conflict** |
| `backend/src/controllers/eventInviteController.js` | New invite handlers | Staged |
| `backend/src/controllers/friendController.js` | Friend response handling | Staged |
| `backend/src/models/EventInvite.js` | New invite schema | Staged |
| `backend/src/routes/events.js` | Invite endpoints alongside local rating/cancellation routes | **Conflict** |
| `backend/src/routes/friends.js` | Friend endpoints | Staged |
| `backend/src/services/friendAttendance.js` | New event-specific friend lookup | Staged |
| `backend/src/services/friendService.js` | Friend requests/network rewrite | Staged |
| `mobile/app.json` | Native plugin configuration | Staged |
| `mobile/package-lock.json` | Dependency lock changes | Staged |
| `mobile/package.json` | Add calendar dependency | Staged |
| `mobile/src/api/friends.ts` | New typed friend client | Staged |
| `mobile/src/components/AcceptRequestCard.tsx` | New request-response card | Staged |
| `mobile/src/components/EventCard.tsx` | Event tile/friend display | Staged |
| `mobile/src/components/FriendActionButton.tsx` | New relationship action | Staged |
| `mobile/src/components/FriendAvatarStack.tsx` | New attendee avatar group | Staged |
| `mobile/src/components/InviteFriendsModal.tsx` | New invite dialog | Staged |
| `mobile/src/components/PriceInputField.tsx` | Price-input behavior | Staged |
| `mobile/src/screens/event/EventDetailsScreen.tsx` | Friend/invite/calendar UI versus local rating UI | **Conflict** |
| `mobile/src/screens/event/HomeScreen.tsx` | Price display versus notification bell | **Conflict** |
| `mobile/src/screens/host/EventHostDetailsScreen.tsx` | Invite/calendar/revenue UI versus rating counts | **Conflict** |
| `mobile/src/screens/host/EventHostScreen.tsx` | Host dashboard changes | Staged |
| `mobile/src/screens/settings/PublicProfileScreen.tsx` | Friend action versus Follow/Unfollow | **Conflict** |
| `mobile/src/screens/settings/UserProfileScreen.tsx` | Request card versus notification imports | **Conflict** |

A direct comparison of local HEAD with the incoming branch also lists local notification/rating files as absent on the incoming branch. Those are not actual deletions in the current merge; they belong to the local notification commit and remain present. Use the shared merge base to identify the incoming branch's 26 actual changes.

## Separate approved notification import

`backend/scripts/seedNotificationInboxes.js` was created for this task. It previews by default and writes only with `--apply`. It uses the three ObjectIds previously supplied by the user to distinguish Patrick's `hollow12` account from other Patrick accounts. Joshua resolves to `Joshua`, and Demi to `demiberry`.

The import adds one record per implemented type per account, unread and in-app only, with a test label, actual event ID, and stable deduplication key. It creates no provider jobs/deliveries, changes no notification preferences, and changes no existing events, selections, ratings, or accounts. Repeating it preserves the already imported records and their read state.

Preflight found no currently eligible attended past event for any of these three accounts. Rating previews therefore open the real rating page, whose server eligibility checks may block submission. The import does not manufacture attendance or alter history to bypass those rules.

The approved import completed successfully: **30 new records**, with **10 stored for `hollow12` (Patrick), 10 for `Joshua`, and 10 for `demiberry` (Demi)**. The import's post-write counts confirmed the three totals. All inserted rows started unread with `channels: ['inApp']`. No provider jobs or deliveries were created.

Only the seed utility and this review report were created by this task. The 26 incoming paths and all seven conflict states were left as found.
