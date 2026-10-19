# 0020: Sequence games

Status: accepted.

A third kind of game, like the default mode of guessthe.game: players guess the entry of the day from a series of photos shown one at a time. Settled with the maintainer one question at a time (2026-10-18).

- **Kind**: `sequence`, picked on the create page and never changed, shown as "Sequence". Like a Blur game it has no attributes, rows show the name only, and the tries, skips (ADR 0019's `SKIP`) and secrecy rules are shared (`isImageGame`).
- **Photos**: the owner sets how many photos every entry has, 1 to 9 (default 6, like guessthe.game), stored in `games.blur_tries` so both image kinds share one try count. Each photo is cropped to 16:9 with the site's crop dialog (upload kind `shot`) and kept in `entries.shots` in the order players see them. An entry has only a name and its photos, no separate square picture; the first photo is the reveal and the editor thumbnail.
- **Incomplete entries**: an entry missing some of its photos can be guessed but is never an answer: it is never drawn and cannot be scheduled. The game pauses only while no entry has every photo. A lowered count keeps the extra photos, so raising it again brings them back.
- **Schedule**: the owner picks an entry per date in the existing Answers tab (Overrides). An unscheduled day takes the oldest entry (lowest id) that was never an answer and is not scheduled later; once every entry has been used, a random one outside the game's skip period, as in a classic game. Scheduling a day re-draws every generated day after today, so no earlier day keeps that entry. Entry and photo-count edits re-draw the future the same way and clear Overrides whose entry can no longer be the answer. Today and the past stay as players saw them.
- **Play**: photo 1 shows first; each wrong guess or skip unlocks the next, and players can tap back to any unlocked photo. A wrong guess or skip on the last try ends the day as lost and reveals the answer. Give up, reset, Past days and parties work as in Blur games.
- **Secrecy**: photos reach players only through `GET /api/games/:slug/shot/:n` (n up to the game's count, today or `?day=N`) and `GET /api/parties/:code/shot/:round/:n`, sent from the stored file; the gallery never shows them. As with Blur boards, the route does not check how many photos a player has earned.
- Rejected: an owner-fixed count of 6 (the maintainer wanted 1-9), per-entry photo counts, a dated queue separate from the Answers tab, a separate square picture per entry, square photos.
