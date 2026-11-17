---
name: see-ui
description: Screenshot or record Guessdle pages on a phone and a desktop, in light and dark, and get each page's runtime problems. Use to check any UI change visually before shipping, to show a reviewer what changed, or when asked to run, view or screenshot the app.
---

# See the UI

One driver for every visual check: `npm run shot -- [options] <path> ...` (`scripts/shot.mjs`). Don't write one-off Playwright scripts for screenshots.

## Steps

1. `npm run build` (the server serves `dist/`).
2. Shoot the pages the change touches, as the right player:

   ```sh
   npm run shot -- /g/petdle /how-to-play
   npm run shot -- --as player @game/edit --click "#tab-entries"
   npm run shot -- --as admin /admin --sizes phone --themes dark --full
   npm run shot -- --as player /create --video
   ```

   It starts the e2e server (Docker Postgres, test sign-in) on port 8090 unless `--base` points at one. `@game` is a fresh game owned by the `--as` player. `--click` runs in order before the shot. `node scripts/shot.mjs --help` lists every option.
3. Open the PNGs it prints (in `shots/`, gitignored) and look: spacing between controls (CLAUDE.md), nothing cut off or overlapping, both themes readable, the phone without sideways scrolling.
4. A `PROBLEM` line means a page error, console error, 5xx or sideways scroll. Fix it, or say why it is expected.
5. Attach the before and after shots to the PR or the reply as evidence, so review is of what the player sees.

The words to use for each page and feature are in `docs/features.md`.
