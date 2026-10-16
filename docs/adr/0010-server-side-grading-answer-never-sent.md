# 0010: Grading happens on the server; the answer is not sent until win or give-up

Status: accepted. The pet-id and `/api/grade`, `/api/game` wording below is superseded by ADR 0013: guesses are numeric entry ids and every route lives under `/api/games/:slug/`. The grading and answer-hiding decisions stand.

The client keeps the roster (autocomplete and photos) but not the Daily Answer. Guesses are pet ids; the server grades them with the same core as before (`gradeIds` in `src/game/game.ts`).

- **Anonymous**: guesses stay in `localStorage`. `POST /api/grade {ids}` is stateless and returns graded rows and `victory`, plus the answer name only on a win. Stored guesses are re-graded on load, so an override of today's answer reaches players mid-game.
- **Signed in**: `GET /api/game` and `POST /api/game/guess|give-up|merge|reset` store pet ids per user and day (`user_guesses`, `user_give_ups`). Victory is derived from guesses and the current answer, never stored. Further guesses after a win or give-up get `finished` (409); reset deletes that day's guess and give-up rows at any time (mid-game too; no rows is still 200), and the page asks for confirmation first.
- **Merge**: on login, leftover local guesses are adopted only if the account has no rows for that day (else 409, server state wins). The payload is validated like guesses; the day must equal the current Day Number.
- Every response carries the Day Number; a client that sees a newer day resets itself. Errors are JSON `invalid` (400), `duplicate` or `finished` (409); unknown ids are rejected server-side.

## Accepted leak: give-up is open

`POST /api/give-up` reveals the answer and is open to anyone, signed in or not, without proof of any guesses. A scripted caller can read today's answer. This is accepted: the goal is hiding it from casual inspection of the bundle, source and devtools, not from a determined caller. Closing it (require N guesses, signed-in only) is out of scope. Rate limits (ADR 0009) bound enumeration but are not a defence.

## Consequences

- Each guess is a network round trip; the grid cannot be graded offline.
- Anonymous players are trusted with their own history: a forged id list only changes their own grid.
