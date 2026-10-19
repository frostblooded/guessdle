// The admin queue, game list (spec #66) and what changed since a game's last approval; status
// moves live in lifecycle.ts.
import type pg from "pg";
import { diffGame, type Change, type Snapshot } from "../game/approval-diff.ts";
import { listAttributes } from "./attributes.ts";
import { findGameById, loadRoster, type GameRow } from "./games.ts";

type Q = Pick<pg.Pool, "query">;

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

// The game as it is now, in the shape approval saves (ADR 0022)
export async function snapshotOf(q: Q, game: GameRow): Promise<Snapshot> {
  const attributes = await listAttributes(q, game);
  const { entries } = await loadRoster(q, game);
  return {
    at: new Date().toISOString(),
    kind: game.kind,
    name: game.name,
    description: game.description,
    cover: game.coverUrl,
    blurTries: game.blurTries,
    attributes,
    entries: entries.map((e) => ({
      id: e.id,
      name: e.name,
      photo: game.kind === "blur" || game.kind === "quiz" ? e.photo : "",
      description: e.description ?? "",
      values: Object.fromEntries(
        attributes.map((a, i) => [String(a.id), e.values[i] ?? ""]),
      ),
      ...(e.blurOrder && { blurOrder: e.blurOrder }),
      ...(e.shots && { shots: e.shots }),
      ...(e.quiz && { quiz: e.quiz }),
    })),
  };
}

// Saves the game at `id` as approved. With `ifMissing`, only when none is saved yet: games
// approved before snapshots existed get theirs before their first edit.
export async function saveSnapshot(
  q: Q,
  id: number,
  ifMissing: boolean = false,
): Promise<void> {
  const { rows } = await q.query<{ missing: boolean }>(
    "select approved_snapshot is null as missing from games where id = $1",
    [id],
  );
  if (ifMissing && !rows[0]?.missing) {
    return;
  }
  const game = await findGameById(q, id);
  if (game) {
    await q.query("update games set approved_snapshot = $2 where id = $1", [
      id,
      JSON.stringify(await snapshotOf(q, game)),
    ]);
  }
}

// What changed since the last approval; null when the game was never approved
export async function changesSinceApproval(
  q: Q,
  game: GameRow,
): Promise<{ since: string; changes: Change[] } | null> {
  const { rows } = await q.query<{ snapshot: Snapshot | null }>(
    "select approved_snapshot as snapshot from games where id = $1",
    [game.id],
  );
  const then = rows[0]?.snapshot;
  return then
    ? { since: then.at, changes: diffGame(then, await snapshotOf(q, game)) }
    : null;
}
