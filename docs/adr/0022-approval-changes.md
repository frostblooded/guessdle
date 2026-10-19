# 0022: Changes since the last approval

Status: accepted.

When a game comes up for review again, the admin sees what changed since it was last approved. Settled with the maintainer one question at a time (2026-10-19).

- **Snapshot**: approving a game saves it as approved in `games.approved_snapshot` (migration 024): details, attributes by id and active entries with their values, pictures, Blur order, Sequence photos and quiz answers (`snapshotOf`, `src/server/approval.ts`). A game approved before snapshots existed gets one from its current data just before its first edit or unpublish, which is still the approved version.
- **Diff**: `GET /api/admin/games/:slug/changes` compares the snapshot with the game now (`diffGame`, `src/game/approval-diff.ts`): Details, Attributes (added, removed, renamed, type changed) and Entries or Questions (added, removed, changed fields with old and new values). Entries and attributes match by id, so a rename is a change, not a remove and add. A game never approved has nothing to compare with and says so.
- **Where**: a "See changes" button sits with Approve and Reject wherever they show (the Approval queue, the admin game list, Play and the editor) and opens the list in a popup. The admin email is unchanged.
- **Always against the last approval**: a rejected game that is fixed and resubmitted is compared with its last approved version, not the rejected one. Edits that keep the status (reordering attributes, a quiz's right answer, the skip period) still show, as they did change since the approval; reordering is not listed.
- Old pictures are the upload URLs the snapshot held; a picture freed since then no longer loads, and the popup shows its URL text instead.
- Rejected: a highlighted copy of the whole entries table (too wide and long on a phone), comparing against the rejected version, a diff in the admin email.
