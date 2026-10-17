# Coding standards

Read during review. Judgement calls only; tooling covers the rest (`npm run lint` enforces braces, explicit types on function parameters, class members and properties, and `src/**/*.ts` files under 400 lines; `npm run dup` fails on duplicated code in `src/`).

## Indentation

2 spaces.

## Structure

- One route group per module in `src/server/routes/`, each taking the shared `AppContext`. Parse request input through the helpers in `routes/context.ts`, not inline casts.
- Client calls to the API go through `src/game/transport.ts`; status-to-result mapping lives there once.
- When a few values travel together through several functions, bundle them into one type (`GameContext` in `src/server/user-game.ts`).

## Editor pages

- A background refresh (status, counts, lists) never re-renders inputs the user may be typing in; only the first load and the user's own save write field values.
- A new e2e test waits for `#loading-state` to be hidden before it interacts.

## Security-sensitive code

Check each of these when the diff touches `src/server/auth.ts`, sessions, or any `/api` route:

- Login tokens are random, stored only as a hash, single use (atomic consume) and short-lived; `email/request` answers the same for every address; `email/verify` stays a POST behind the guard.
- Mutating routes pass the JSON-only and Origin guard.
- Every `/api/admin/*` route checks the admin flag on the request, not a cached value.
- Responses reveal the Daily Answer only after a win or give-up.
- Changes to shared state (answers, user rows) take the advisory or row lock.
- A URL or id taken from the request body that points at stored data (an upload, an entry) is checked to belong to the acting user or the game before it is saved or deleted.

## Error messages

Every error a user can reach says what happened and what to do next. Map each cause to its own message (`src/game/failures.ts` for server codes); say "check your connection" only for a real network failure, never for a refusal or a server error.
