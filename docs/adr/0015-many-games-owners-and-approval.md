# 0015: Many games, owners and an approval gate

Status: accepted (spec #66, map #52).

Guessdle hosts many daily guessing games. Any signed-in user creates one and becomes its Owner; the original game is ownerless and only admins edit it. Where the data lives and why ids are numeric: ADR 0013. Uploads: ADR 0014.

- **Status lifecycle**: a new game is `draft` (visible to its owner and admins only). Submit (needs at least 2 active entries) moves it to `pending`. An admin approves it (gallery) or rejects it with a reason. Any text, image or schema change to an `approved` or `rejected` game sets it back to `pending`; edits of a draft stay draft. The owner can unpublish an approved game (to `pending`). Admins are emailed when a game enters `pending`, not for drafts or for edits of an already pending game.
- **Reachability**: pending, rejected and approved playable games open by link, so creators can share before approval; only approved ones appear in the gallery and are indexable (others get `noindex`). A draft, or any game with fewer than 2 active entries, is a 404 for everyone except its owner and admins.
- **Permissions**: anyone plays; any signed-in user creates; the owner and admins edit, override, submit, unpublish and delete; approve, reject, the queue, all-games delete, users and backups are admin only. Deleting a user deletes their games.
- **Slugs** are generated from the name, `a-z0-9-`, 3 to 40 characters, globally unique, with reserved top-level words refused. They are immutable after creation (even for admins) so shared links never break; there are no redirects.
- **Per-game state**: each game has its own Daily Answer, Answer History, Day 0 (its creation date) and Game State. Anonymous browser state is namespaced `game:<slug>:`.
- Rejected: pre-moderation of every image, caps on games or entries per user (only byte quota and abuse caps), per-game How to Play pages.
