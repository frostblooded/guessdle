---
name: gather-game-data
description: Make a Game Data Picker app for a Wikipedia list that the maintainer opens on their own machine to tick real infobox categories and rows, then paste the import file into a Guessdle game's Import entries popup.
disable-model-invocation: true
---

# Gather game data

Arguments: a **list** (a Wikipedia list page, by title or URL) and optionally a **language** (default `en`). Every value in the picker is read from a real infobox. The app is the cached `assets/picker.html`: one HTML file that reads Wikipedia from the browser that opens it, so the reading happens on the maintainer's own connection, never through the throttled address of a cloud session. Each call writes a new copy filled with the list to read; earlier copies stay.

## Steps

1. **Pick the list page.** If the argument names a topic rather than a page ("Pixar films"), find the matching "List of …" page on Wikipedia. Done when you hold one page title that exists.
2. **Write the app.** From the repo root:

   ```sh
   node .claude/skills/gather-game-data/scripts/build.mjs --list "List of Pixar films" --out <file>
   ```

   Options: `--wiki de` for another language, `--from tables|bullets|<n>` (default `auto`: linked table rows when the page has them, else bullet lists; `<n>` reads only table n). Name the file `<list-slug>-picker.html`. In a cloud session, write it to `/mnt/project-files/game-data-picker/` and attach it to your reply; with the maintainer's device linked, also copy it there with the remote-devices commit tool. In a local session, write it to `gathered/` (gitignored) and open it. Done when the maintainer has the file and one line on how to use it: open it in a browser (double-click), wait for the pages to load, tick, Copy import file.

The app also works empty: opened without a list it shows the form, and `?list=…&wiki=…&from=…` on its URL fills it.

## What the maintainer does next

The app reads the list page, then every linked page 4 at a time (retrying rate limits), adding rows as they arrive; pages without an infobox and pages that kept failing are named in the progress line (Read again retries). Then: tick categories (each shows how many pages have it, and a Text, List or Number type to adjust), tick rows (unticked by default; rows missing a ticked value, over Guessdle's limits or sharing a name are blocked and say why), correct any value or name by clicking it (edits are marked and can be undone), pick each picture's square with its Edit button (centred by default), then **Copy import file**. Each row's picture is the page's Wikipedia page image (the REST summary's lead image; the infobox image only when the page has none). In Guessdle: game editor, Entries tab, **Import entries**, paste. The server adds missing attributes and a Photo column, creates new entries, fills only blank values on entries that already exist, and copies each picture from `upload.wikimedia.org`, cut to the square picked in the app. Classic games only. The file format is checked by `src/game/import-file.ts`.

If the rows are the wrong things (most pages skipped, or rows that are awards or people), the list linked other pages: change **Rows from** to one table or to bullet lists and press Read again.

## Other sources

The app reads Wikipedia only. For another source, tell the maintainer that and ask before building anything.
