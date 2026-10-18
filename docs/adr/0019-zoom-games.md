# 0019: Zoom games

Status: accepted.

A second kind of game, like Gamedle's image modes: players guess the entry of the day from zoomed-in parts of its image. Settled with the maintainer one question at a time (2026-10-18).

- **Kind**: a game is `classic` (attributes) or `zoom`, chosen on the create page and never changed (`games.kind`). A Zoom game has no attributes; the attribute routes refuse it.
- **Image**: each entry has one image, uploaded uncropped (`kind=zoom`: the browser only shrinks it to fit 2000 px, the server re-encodes it like any upload). The same file is the reveal at the end and the owner's thumbnail in the editor.
- **Parts**: the owner places square parts on the image in the editor, in the order players see them (first is the closest zoom). The count is per game (`games.zoom_parts`, 1 to 6, default 5) and every entry needs exactly that many (`entry_zoom_parts`, in the image's own pixels); an entry missing its image or a part pauses the game like a missing value. Raising the count pauses the game until the new parts are placed; lowering it keeps each entry's first parts.
- **Tries**: one try per part. Each wrong guess shows the next part; a wrong guess on the last part ends the day as lost and reveals the answer. Give up and reset work as in classic games.
- **Secrecy**: no entry photo reaches a player before the day (or party round) is over. `GET /api/games/:slug` and party views send Zoom entries without photos, guesses are graded on the name only, the gallery never makes a collage of Zoom photos, and the parts are rendered on the server from the stored file (`GET /api/games/:slug/zoom/:n`, `GET /api/parties/:code/zoom/:round/:n`), so the image URL stays secret until `answerPhoto` reveals it. The part routes do not check how many parts a player has earned: anonymous play is stateless, so a determined player could fetch later parts early. Accepted, like the stateless give-up.
- **Parties**: Zoom games host parties too. A round shows its own parts; running out of tries ends a player's round with no points ("out of tries").
- Rejected: a Zoom mode on every classic game (the maintainer wanted a separate kind), reusing the square 800 px photos (soft close zooms), free rectangles (letterboxing), unlimited guesses (anyone wins by walking the list), thumbnails in the guess list (they give the answer away).
