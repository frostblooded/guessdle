# 0019: Blur games

Status: accepted.

A second kind of game, like Gamedle's image mode: players guess the entry of the day from its image split into a 3x3 grid, with every square blurred but one. Settled with the maintainer one question at a time (2026-10-18; it replaced a first take with zoomed-in parts, which never shipped).

- **Kind**: a game is `classic` (attributes) or `blur`, chosen on the create page and never changed (`games.kind`). A Blur game has no attributes; the attribute routes refuse it.
- **Image**: each entry has one square image, cropped with the same crop dialog and upload as entry photos (`kind=photo`). It is the reveal at the end and the owner's thumbnail in the editor.
- **Order**: the owner clicks the nine squares in the order players see them clear (`entries.blur_order`, cell numbers 0-8 row by row; eight clicks finish it). An entry missing its image or order pauses the game like a missing value. A new image keeps the order.
- **Entries**: a Blur game plays with a single entry (`minEntriesOf`); a classic game still needs two.
- **Tries**: per game, 1 to 9 (`games.blur_tries`, default 9). At first one square is clear; each wrong guess clears the next. A wrong guess on the last try ends the day as lost and reveals the answer, so with fewer than nine tries the image never fully clears before the end. Give up and reset work as in classic games.
- **Secrecy**: no entry photo reaches a player before the day (or party round) is over. `GET /api/games/:slug` and party views send Blur entries without photos, guesses are graded on the name only, the gallery banner of a Blur game without a cover is a collage of heavily blurred tiles rendered on the server (`GET /api/games/:slug/tile/:n`, by index, so no photo URL leaks), and the board is rendered on the server from the stored file (`GET /api/games/:slug/blur/:n`, `GET /api/parties/:code/blur/:round/:n`, n squares clear, at most the game's tries), so the image URL stays secret until `answerPhoto` reveals it. The board routes do not check how many squares a player has earned: anonymous play is stateless, so a determined player could fetch a clearer board early. Accepted, like the stateless give-up.
- **Parties**: Blur games host parties too. A round shows its own board; running out of tries ends a player's round with no points ("out of tries").
- Rejected: a Blur mode on every classic game (the maintainer wanted a separate kind), blurring in the browser (the clear image would reach the player), unlimited guesses after the image clears, thumbnails in the guess list (they give the answer away), zoomed-in parts (the first take, swapped for Gamedle's grid).
