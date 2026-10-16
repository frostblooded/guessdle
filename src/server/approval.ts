// The approval lifecycle (spec #66): submit, unpublish, review, the admin queue and the admin email.
import type pg from "pg";
import { MIN_ENTRIES, type GameRow } from "./games.ts";
import type { MailConfig } from "./mailer.ts";

type Q = Pick<pg.Pool, "query">;
type Moved = "ok" | "invalid_state";

export const MAX_REASON = 500;

// A guarded status change; "invalid_state" when the game is not in a `from` state
async function move(
  q: Q,
  game: GameRow,
  from: string[],
  to: string,
  reason: string,
): Promise<Moved> {
  const { rowCount } = await q.query(
    `update games set status = $3, reject_reason = $4, updated_at = now()
     where id = $1 and status = any($2)`,
    [game.id, from, to, reason],
  );
  return rowCount === 1 ? "ok" : "invalid_state";
}

// Draft or rejected to pending; needs MIN_ENTRIES active entries
export async function submitGame(
  q: Q,
  game: GameRow,
): Promise<Moved | "too_few_entries"> {
  if (!["draft", "rejected"].includes(game.status)) {
    return "invalid_state";
  }
  const { rows } = await q.query<{ n: number }>(
    "select count(*)::int as n from entries where game_id = $1 and deleted_at is null",
    [game.id],
  );
  return rows[0]!.n < MIN_ENTRIES
    ? "too_few_entries"
    : move(q, game, ["draft", "rejected"], "pending", game.rejectReason);
}

export const unpublishGame = (q: Q, game: GameRow): Promise<Moved> =>
  move(q, game, ["approved"], "pending", "");

export const approveGame = (q: Q, game: GameRow): Promise<Moved> =>
  move(q, game, ["pending"], "approved", "");

export const rejectGame = (
  q: Q,
  game: GameRow,
  reason: string,
): Promise<Moved> => move(q, game, ["pending"], "rejected", reason);

export interface QueueItem {
  slug: string;
  name: string;
  owner: string | null;
  entryCount: number;
  since: string;
}

// Pending games, oldest first (updated_at is when it last changed, which is when it entered pending)
export async function listQueue(q: Q): Promise<QueueItem[]> {
  const { rows } = await q.query<QueueItem>(
    `select g.slug, g.name, u.email as owner, g.updated_at as since,
       (select count(*)::int from entries e where e.game_id = g.id and e.deleted_at is null) as "entryCount"
     from games g left join users u on u.id = g.owner_id
     where g.status = 'pending' order by g.updated_at, g.id`,
  );
  return rows;
}

export async function pendingCount(q: Q): Promise<number> {
  const { rows } = await q.query<{ n: number }>(
    "select count(*)::int as n from games where status = 'pending'",
  );
  return rows[0]!.n;
}

export interface GameListItem {
  slug: string;
  name: string;
  owner: string | null;
  status: string;
  entryCount: number;
}

// Every game of any status for the admin, newest first. `search` matches name, slug or owner email,
// case-insensitive; strpos keeps LIKE wildcards literal.
export async function listAllGames(
  q: Q,
  search: string,
): Promise<GameListItem[]> {
  const { rows } = await q.query<GameListItem>(
    `select g.slug, g.name, u.email as owner, g.status,
       (select count(*)::int from entries e where e.game_id = g.id and e.deleted_at is null) as "entryCount"
     from games g left join users u on u.id = g.owner_id
     where $1 = '' or strpos(lower(g.name), lower($1)) > 0
       or strpos(g.slug, lower($1)) > 0
       or strpos(lower(coalesce(u.email, '')), lower($1)) > 0
     order by g.id desc`,
    [search],
  );
  return rows;
}

// Deletes the game (everything under it cascades); returns the upload URLs the caller should remove
export async function deleteGame(q: Q, game: GameRow): Promise<string[]> {
  const { rows } = await q.query<{ url: string }>(
    "select photo_url as url from entries where game_id = $1 and photo_url <> ''",
    [game.id],
  );
  await q.query("delete from games where id = $1", [game.id]);
  return [...rows.map((r) => r.url), ...(game.coverUrl ? [game.coverUrl] : [])];
}

// Mails every admin that `game` entered pending. Never throws: a mail problem must not fail the edit.
export async function mailAdminsPending(
  q: Q,
  mail: MailConfig | undefined,
  game: { slug: string; name: string },
): Promise<void> {
  if (!mail) {
    return;
  }
  try {
    const { rows } = await q.query<{ email: string }>(
      "select email from users where admin",
    );
    const text = `The game "${game.name}" is waiting for approval.\n\nPlay it: ${mail.publicUrl}/g/${game.slug}\nReview it: ${mail.publicUrl}/admin\n`;
    const subject = `Guessdle: "${game.name}" is waiting for approval`;
    await Promise.all(
      rows.map(({ email }) => mail.mailer.send({ to: email, subject, text })),
    );
  } catch (err) {
    console.error("Could not mail the admins", err);
  }
}
