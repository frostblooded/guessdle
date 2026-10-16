// Game, attribute and entry data: the one seam between routes and the tables.
import type pg from "pg";
import type { AttributeValue } from "../game/correctness.ts";
import type { AttributeType, Entry, GameAttribute } from "../game/game.ts";
import { slugError } from "../game/slug.ts";
import type { EditKind } from "./lifecycle.ts";

type Q = Pick<pg.Pool, "query">;

export const DEFAULT_SKIP_PERIOD = 5;

export type GameStatus = "draft" | "pending" | "approved" | "rejected";

export interface GameRow {
  id: number;
  slug: string;
  name: string;
  description: string;
  coverUrl: string;
  ownerId: number | null;
  status: GameStatus;
  rejectReason: string;
  // Day Number 0 ("YYYY-MM-DD")
  startDate: string;
  skipPeriod: number | null;
}

// A game plays with at least this many active entries
export const MIN_ENTRIES = 2;

export const skipOf = (game: GameRow): number =>
  game.skipPeriod ?? DEFAULT_SKIP_PERIOD;

export async function findGame(q: Q, slug: string): Promise<GameRow | null> {
  const { rows } = await q.query<GameRow>(
    `select id::int, slug, name, description, cover_url as "coverUrl",
       owner_id::int as "ownerId", status, reject_reason as "rejectReason",
       to_char(start_date, 'YYYY-MM-DD') as "startDate",
       skip_period as "skipPeriod"
     from games where slug = $1`,
    [slug],
  );
  return rows[0] ?? null;
}

export interface Roster {
  attributes: GameAttribute[];
  // Active entries, by id
  entries: Entry[];
  // Every entry including soft-deleted ones, so past guesses still resolve
  all: Entry[];
}

// A game's attributes and entries with their values
export async function loadRoster(q: Q, game: GameRow): Promise<Roster> {
  const attributes = await q.query<{
    id: number;
    name: string;
    type: AttributeType;
  }>(
    "select id::int, name, type from attributes where game_id = $1 order by position, id",
    [game.id],
  );
  const entries = await q.query<{
    id: number;
    name: string;
    photo: string;
    deleted: boolean;
  }>(
    `select id::int, name, photo_url as photo, deleted_at is not null as deleted
     from entries where game_id = $1 order by id`,
    [game.id],
  );
  const values = await q.query<{
    entry_id: number;
    attribute_id: number;
    value: string;
  }>(
    `select v.entry_id::int, v.attribute_id::int, v.value
     from entry_values v join entries e on e.id = v.entry_id
     where e.game_id = $1 order by v.position`,
    [game.id],
  );
  const byCell = new Map<string, string[]>();
  for (const { entry_id, attribute_id, value } of values.rows) {
    const key = `${entry_id}:${attribute_id}`;
    byCell.set(key, [...(byCell.get(key) ?? []), value]);
  }
  const cell = (entryId: number, attr: (typeof attributes.rows)[number]) => {
    const list = byCell.get(`${entryId}:${attr.id}`) ?? [];
    return (attr.type === "list" ? list : (list[0] ?? "")) as AttributeValue;
  };
  const all = entries.rows.map(({ id, name, photo }): Entry => ({
    id,
    name,
    photo,
    values: attributes.rows.map((attr) => cell(id, attr)),
  }));
  return {
    attributes: attributes.rows.map(({ name, type }) => ({ name, type })),
    entries: all.filter((_, i) => !entries.rows[i]!.deleted),
    all,
  };
}

export interface GalleryCard {
  slug: string;
  name: string;
  description: string;
  cover: string;
  entryCount: number;
}

// Approved games with at least MIN_ENTRIES active entries: the original first, then newest first
export async function listGallery(q: Q): Promise<GalleryCard[]> {
  const { rows } = await q.query<GalleryCard>(
    `select g.slug, g.name, g.description, g.cover_url as cover, count(e.id)::int as "entryCount"
     from games g join entries e on e.game_id = g.id and e.deleted_at is null
     where g.status = 'approved'
     group by g.id having count(e.id) >= $1
     order by g.slug = 'petdle' desc, g.created_at desc, g.id desc`,
    [MIN_ENTRIES],
  );
  return rows;
}

export interface MyGame {
  slug: string;
  name: string;
  cover: string;
  status: GameStatus;
  rejectReason: string;
  entryCount: number;
}

// A user's own games, newest first, whatever their status
export async function listOwned(q: Q, userId: number): Promise<MyGame[]> {
  const { rows } = await q.query<MyGame>(
    `select g.slug, g.name, g.cover_url as cover, g.status, g.reject_reason as "rejectReason",
       (select count(*)::int from entries e where e.game_id = g.id and e.deleted_at is null) as "entryCount"
     from games g where g.owner_id = $1 order by g.created_at desc, g.id desc`,
    [userId],
  );
  return rows;
}

// Resolves a name clash on a generated slug with -2, -3, ...; a typed slug that is taken is refused.
// shortcut: one insert per candidate, fine until a name has hundreds of clashes
export async function createGame(
  q: Q,
  ownerId: number,
  name: string,
  startDate: string,
  slug: { typed: string } | { base: string },
): Promise<string | "slug_taken"> {
  const insert = async (candidate: string): Promise<boolean> =>
    (
      await q.query(
        `insert into games (slug, name, owner_id, start_date) values ($1, $2, $3, $4)
         on conflict (slug) do nothing`,
        [candidate, name, ownerId, startDate],
      )
    ).rowCount === 1;
  if ("typed" in slug) {
    return (await insert(slug.typed)) ? slug.typed : "slug_taken";
  }
  for (let n = 1; ; n++) {
    const suffix = n === 1 ? "" : `-${n}`;
    const candidate =
      slug.base.slice(0, 40 - suffix.length).replace(/-+$/, "") + suffix;
    if (slugError(candidate) === null && (await insert(candidate))) {
      return candidate;
    }
  }
}

export interface GamePatch {
  name?: string;
  description?: string;
  coverUrl?: string;
  skipPeriod?: number | null;
}

// The lifecycle edit kind of a patch: text or image changes reset status, a skip period alone does not
export function patchKind(game: GameRow, patch: GamePatch): EditKind {
  const next = { ...game, ...patch };
  return next.name !== game.name || next.description !== game.description
    ? "details"
    : next.coverUrl !== game.coverUrl
      ? "cover"
      : "skip-period";
}

// Writes the patch (status is the lifecycle's job). Returns the cover URL the edit replaced,
// for the caller to delete.
export async function updateGame(
  q: Q,
  game: GameRow,
  patch: GamePatch,
): Promise<string | null> {
  const next = { ...game, ...patch };
  await q.query(
    `update games set name = $2, description = $3, cover_url = $4, skip_period = $5,
       updated_at = now() where id = $1`,
    [game.id, next.name, next.description, next.coverUrl, next.skipPeriod],
  );
  return next.coverUrl === game.coverUrl ? null : game.coverUrl;
}

// Abuse caps (spec #66); entry value caps live with entry editing
export const MAX_ATTRIBUTES = 10;
export const MAX_ATTRIBUTE_NAME = 40;
export const MAX_VALUE_LENGTH = 200;

export interface AttributeRow {
  id: number;
  name: string;
  type: AttributeType;
}

export async function listAttributes(
  q: Q,
  game: GameRow,
): Promise<AttributeRow[]> {
  const { rows } = await q.query<AttributeRow>(
    "select id::int, name, type from attributes where game_id = $1 order by position, id",
    [game.id],
  );
  return rows;
}

export type AttributeEdit =
  | { add: { name: string; type: AttributeType } }
  | {
      change: {
        id: number;
        name?: string | undefined;
        type?: AttributeType | undefined;
      };
    }
  | { remove: number };

// Adds, renames, retypes or removes an attribute. Removing hard-deletes its values; Text to
// List keeps the value as a one-item list, List to Text joins the items with ", ". A real
// change is "ok" (the lifecycle then resets the status), a rename to the same name is "noop".
// Runs in the caller's game transaction (lifecycle.edit).
export async function editAttributes(
  client: Q,
  game: GameRow,
  edit: AttributeEdit,
): Promise<"ok" | "noop" | "invalid" | "attribute_exists" | "not_found"> {
  const attrs = await listAttributes(client, game);
  const taken = (name: string, except?: number): boolean =>
    attrs.some(
      (a) => a.id !== except && a.name.toLowerCase() === name.toLowerCase(),
    );
  let changed = true;
  if ("add" in edit) {
    const { name, type } = edit.add;
    if (taken(name) || attrs.length >= MAX_ATTRIBUTES) {
      return taken(name) ? "attribute_exists" : "invalid";
    }
    await client.query(
      `insert into attributes (game_id, name, type, position)
         values ($1, $2, $3, coalesce((select max(position) + 1 from attributes where game_id = $1), 0))`,
      [game.id, name, type],
    );
  } else {
    const id = "remove" in edit ? edit.remove : edit.change.id;
    const attr = attrs.find((a) => a.id === id);
    if (!attr) {
      return "not_found";
    }
    if ("remove" in edit) {
      await client.query("delete from attributes where id = $1", [id]);
    } else {
      const name = edit.change.name ?? attr.name;
      const type = edit.change.type ?? attr.type;
      if (taken(name, id)) {
        return "attribute_exists";
      }
      changed = name !== attr.name || type !== attr.type;
      if (type === "text" && attr.type === "list") {
        await client.query(
          `update entry_values v set value = j.joined
             from (select entry_id, left(string_agg(value, ', ' order by position), $2) as joined
                   from entry_values where attribute_id = $1 group by entry_id) j
             where v.attribute_id = $1 and v.entry_id = j.entry_id and v.position = 0`,
          [id, MAX_VALUE_LENGTH],
        );
        await client.query(
          "delete from entry_values where attribute_id = $1 and position > 0",
          [id],
        );
      }
      await client.query(
        "update attributes set name = $2, type = $3 where id = $1",
        [id, name, type],
      );
    }
  }
  return changed ? "ok" : "noop";
}
