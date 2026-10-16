# 0014: Images are uploaded, re-encoded on the server and served from a volume

Status: accepted (spec #66).

Cover images and entry photos come from users, so the server never stores or serves their bytes as sent.

- `POST /api/uploads?kind=photo|cover` takes JPEG, PNG or WebP up to 5 MB, decides the type by magic bytes (not the header or the extension), resizes with `sharp` (photo max 800px, cover max 1200px) and re-encodes to WebP under a random-hex name. Corrupt, polyglot and unsupported files are refused (422, 415, 413). Re-encoding drops metadata and anything that is not pixels.
- Files live in `UPLOADS_DIR` (prod: the `uploads` named volume, read-write for `api`, read-only for nginx, which serves `/uploads/` directly; the dev server serves the same folder). The volume is tarred nightly by the backup sidecar.
- A game or entry stores only the URL. A file is deleted on replace, remove and game delete. A nightly sweep removes files older than a day that no row references.
- Abuse bounds: a per-user upload rate limit and a per-user byte quota (table `uploads`). Moderation is the approval gate (ADR 0015) plus admin delete.
- Rejected: hosting on external object storage (more moving parts than a small home server needs) and per-image pre-moderation.

Consequence: the repo no longer holds any game photos; the original ones were moved once with `scripts/import-photos.mjs` (cutover runbook in `docs/deploy.md`).
