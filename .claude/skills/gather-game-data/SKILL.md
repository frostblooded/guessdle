---
name: gather-game-data
description: Build a Game Data Picker page from a Wikipedia list so the maintainer can tick real infobox categories and rows, then paste the import file into a Guessdle game's Import entries popup.
disable-model-invocation: true
---

# Gather game data

Arguments: a **list** (default: a Wikipedia list page, by title or URL) and **sources** (default: Wikipedia). Every value that reaches the picker is copied from a real infobox. The page is the cached app in `assets/picker.html`; each call fills it with new data and publishes it as a new page, so earlier pickers stay.

## Steps

1. **Pick the list page.** If the argument names a topic rather than a page ("Pixar films"), find the matching "List of …" page on Wikipedia. Done when you hold one page title or URL that exists.
2. **Gather.** Wikipedia throttles the shared address of cloud sessions hard, so where the run happens depends on the session:

   - **Cloud session:** the maintainer runs it on their own machine. Post the command below for them to paste in their guessdle folder (after `git pull` and `npm ci`), with `--out gathered/<list-slug>.json` (`/gathered` is gitignored). Then take the file back: with the device linked, stage it with the remote-devices folder tools; otherwise ask them to upload it. Done when the file is in your container.
   - **Local session:** run it yourself.

   From the repo root (it needs the repo's `jsdom` and `sharp`):

   ```sh
   node .claude/skills/gather-game-data/scripts/gather.mjs --list "List of Pixar films" --out <scratchpad>/data.json
   ```

   Options: `--wiki de` for another language, `--from tables|bullets` (default: tables when the page has linked table rows, else bullet lists), `--tables 1,2` to read only those tables, `--limit 300`. It reads one page at a time and retries Wikipedia's rate limits, so 100 pages take a few minutes; run it in the background and post a progress line meanwhile. Each row's picture is the page's own Wikipedia page image (the REST summary's lead image; the infobox image only when the page has none), so it is the same picture Wikipedia shows for the page. Done when it prints the row count, most linked pages had an infobox (if most were skipped, the list linked the wrong things: rerun with `--from` or `--tables`), and it printed no "Picture previews still failing" line; if it did, run `gather.mjs --refresh <scratchpad>/data.json` until it exits 0, because rate limits are the usual cause and every row needs its preview for the crop editor.
3. **Build and publish.**

   ```sh
   node .claude/skills/gather-game-data/scripts/build.mjs <scratchpad>/data.json <scratchpad>/<list-slug>-picker.html
   ```

   Publish that file as a new Artifact (icon `table`). Done when the maintainer has the link and one line saying how many rows and categories it offers.

## What the maintainer does next

In the picker: tick categories (each shows how many pages have it, and a Text, List or Number type to adjust), tick rows (unticked by default; rows missing a ticked value, over Guessdle's limits or sharing a name are blocked and say why), correct any value or name by clicking it (edits are marked and can be undone), pick each picture's square with its Edit button (centred by default), then **Copy import file**. In Guessdle: game editor, Entries tab, **Import entries**, paste. The server adds missing attributes and a Photo column, creates new entries, fills only blank values on entries that already exist, and copies each picture from `upload.wikimedia.org`, cut to the square picked in the picker. Classic games only. The file format is checked by `src/game/import-file.ts`.

## Other sources

`gather.mjs` reads Wikipedia only. For any other source the maintainer names, write a `data.json` of the same shape yourself, every value copied verbatim from that source and never filled in or guessed:

```json
{ "source": "…", "list": "…", "listUrl": "https://…", "fetchedAt": "ISO time", "skipped": [],
  "rows": [{ "name": "Toy Story", "title": "Toy Story", "url": "https://…", "image": "https://upload.wikimedia.org/…" , "preview": "https://…", "thumb": "data:image/jpeg;base64,… or null", "thumbSize": [320, 474],
             "fields": { "Directed by": "John Lasseter", "Starring": ["Tom Hanks", "Tim Allen"] } }] }
```

`image` must be on `upload.wikimedia.org` (the only host the importer fetches from) or `null`.

## Cloud sessions

A cloud session still needs `en.wikipedia.org` and `upload.wikimedia.org` allowed for `--refresh` and small lists. The scripts call `curl` because Node's own `fetch` ignores the cloud proxy; `curl` ships with Windows 10 and later, macOS and Linux.
