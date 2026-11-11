# Backend layers

The backend now follows routes -> controllers -> services -> Mongoose models.
This refactor keeps the existing endpoint URLs, request and response shapes,
authentication rules, and database collections. It adds no dependencies or schema
migrations.

Routes attach middleware and select controller functions. Controllers extract
request values, build the verified authentication context, and own response
statuses, headers, binary responses, and error formatting. Services enforce
business rules, coordinate model operations, and call other services or external
providers. Existing Mongoose models continue to define schemas, validation,
indexes, and database access.

Services do not receive Express requests or responses and do not import the
middleware layer. Authenticated operations receive a plain object containing
`userId`, `sessionId`, and `authVersion`. Image/event services receive a plain
public API base URL when they need to construct URLs. Expected business failures
use `ServiceError`; controllers translate that metadata into HTTP responses.

Not every operation uses every layer. Maps services call Google without a model;
authentication middleware calls the session service before a controller runs;
security and write-fencing services can call other services.

## Created files (22)

| File | Responsibility |
| --- | --- |
| [authController.js](../backend/src/controllers/authController.js) | Signup, login, MFA login, account, and logout HTTP handling. |
| [securityController.js](../backend/src/controllers/securityController.js) | HTTP adapters for security state, passwords, MFA, recovery, and account closure. |
| [eventController.js](../backend/src/controllers/eventController.js) | Event responses, creation/update statuses, and image headers/bytes. |
| [eventSelectionController.js](../backend/src/controllers/eventSelectionController.js) | Selection and private booking-history responses. |
| [itineraryController.js](../backend/src/controllers/itineraryController.js) | Itinerary success/error response wrappers. |
| [mapsController.js](../backend/src/controllers/mapsController.js) | Autocomplete/place-detail responses with the existing `error` field. |
| [friendController.js](../backend/src/controllers/friendController.js) | Friend network and request HTTP handling. |
| [userController.js](../backend/src/controllers/userController.js) | Profile and public avatar HTTP handling. |
| [settingsController.js](../backend/src/controllers/settingsController.js) | Preference, city-search, and notification HTTP handling. |
| [controllerUtils.js](../backend/src/controllers/controllerUtils.js) | Extract authentication values/API base URLs and format service errors, including cooldown headers. |
| [authService.js](../backend/src/services/authService.js) | Account validation, uniqueness errors, password login/cooldowns, profile reads/updates, and logout coordination. |
| [sessionService.js](../backend/src/services/sessionService.js) | Hashed session creation, expiry/account/version checks, and current-session deletion. |
| [eventService.js](../backend/src/services/eventService.js) | Event queries, live-event filtering, ownership, validation, transactional writes, and image retrieval. |
| [eventSelectionService.js](../backend/src/services/eventSelectionService.js) | Independent selection flags, owner-only history, and read-only past-selection rules. |
| [itineraryService.js](../backend/src/services/itineraryService.js) | Schedule validation, budget/category selection, and usable future-slot filtering. |
| [mapsService.js](../backend/src/services/mapsService.js) | Google Places requests, input rules, and provider diagnostics. |
| [friendService.js](../backend/src/services/friendService.js) | Friend queries, relationship rules, and account-fenced request updates. |
| [userService.js](../backend/src/services/userService.js) | Profile/avatar model operations and durable avatar URL construction. |
| [settingsService.js](../backend/src/services/settingsService.js) | Category/city preferences, notification defaults/merging, contact lookup, and fenced writes. |
| [serviceError.js](../backend/src/services/serviceError.js) | Shared business-error metadata without Express dependencies. |
| [noStore.js](../backend/src/middleware/noStore.js) | Reusable no-cache middleware. |
| [backend-architecture.md](backend-architecture.md) | Architecture explanation and complete change inventory. |

## Modified files (13)

| File | Change |
| --- | --- |
| [routes/auth.js](../backend/src/routes/auth.js) | Endpoint, authentication, cache, and security-router wiring only. |
| [routes/security.js](../backend/src/routes/security.js) | Security endpoints now delegate to controllers instead of passing requests to services. |
| [routes/events.js](../backend/src/routes/events.js) | Event endpoints and middleware only. |
| [routes/eventSelections.js](../backend/src/routes/eventSelections.js) | Private selection/history endpoints and middleware only. |
| [routes/itinerary.js](../backend/src/routes/itinerary.js) | Schedule endpoint registration only. |
| [routes/mapsRoutes.js](../backend/src/routes/mapsRoutes.js) | Autocomplete/place-detail endpoint registration only. |
| [routes/friends.js](../backend/src/routes/friends.js) | Friend endpoints and authentication middleware only. |
| [routes/users.js](../backend/src/routes/users.js) | Profile/avatar endpoints and authentication middleware only. |
| [routes/settings.js](../backend/src/routes/settings.js) | Settings endpoints, authentication, and cache middleware only. |
| [middleware/requireAuth.js](../backend/src/middleware/requireAuth.js) | Reads the Bearer header and uses the session service; no direct model queries. |
| [services/accountSecurity.js](../backend/src/services/accountSecurity.js) | Plain authentication/body arguments; HTTP error formatting moved to controllers; imports session service. |
| [services/activeAccountWrite.js](../backend/src/services/activeAccountWrite.js) | Receives plain authentication values and uses the session service; fence errors extend `ServiceError`. |
| [services/cityPreferences.js](../backend/src/services/cityPreferences.js) | City lookup errors extend `ServiceError` while retaining existing messages and status metadata. |

## Scope and review

This refactor did not modify models, mobile code, package files, startup wiring,
environment configuration, or database records. It did not delete files. Existing
working-tree model/date/mobile edits and the already-deleted seed scripts and
fixtures were preserved, rather than being attributed to this refactor.

Source and diff review covered controller/service wiring, response/error shapes,
middleware order, authentication version/expiry checks, MFA setup binding,
cooldowns, transactional account protections, image handling, and existing event
expiry/history behavior. Per the user's instruction, no tests, lint, syntax
execution, app launches, or API/database calls were run. Runtime behavior remains
for manual verification after restarting the backend.
