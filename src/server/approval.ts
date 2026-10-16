// The admin queue, game list (spec #66); status moves live in lifecycle.ts.
import type pg from "pg";

type Q = Pick<pg.Pool, "query">;
export const MAX_REASON = 500;

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
