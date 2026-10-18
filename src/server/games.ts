// Game, attribute and entry data: the one seam between routes and the tables.
import { MIN_ENTRIES } from "../game/limits.ts";
import type pg from "pg";
import type { AttributeValue } from "../game/correctness.ts";
import {
  firstImage,
  hasAllValues,
  type AttributeType,
  type Entry,
  type GameAttribute,
} from "../game/game.ts";
import { MAX_TILES } from "../game/banner.ts";
import { slugError } from "../game/slug.ts";
import type { GameKind } from "../game/blur.ts";
import type { QuizSpec } from "../game/quiz.ts";
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
  kind: GameKind;
  // Blur games: the number of tries
  blurTries: number;
}

// A game plays with at least this many active entries

export const skipOf = (game: GameRow): number =>
  game.skipPeriod ?? DEFAULT_SKIP_PERIOD;

const gameWhere = async (
  q: Q,
  where: "slug" | "id",
  value: string | number,
): Promise<GameRow | null> => {
  const { rows } = await q.query<GameRow>(
    `select id::int, slug, name, description, cover_url as "coverUrl",
       owner_id::int as "ownerId", status, reject_reason as "rejectReason",
       to_char(start_date, 'YYYY-MM-DD') as "startDate",
       skip_period as "skipPeriod", kind, blur_tries as "blurTries"
     from games where ${where} = $1`,
    [value],
  );
  return rows[0] ?? null;
};

export const findGame = (q: Q, slug: string): Promise<GameRow | null> =>
  gameWhere(q, "slug", slug);

// A party's game, whatever its status (ADR 0016)
export const findGameById = (q: Q, id: number): Promise<GameRow | null> =>
  gameWhere(q, "id", id);

export interface Roster {
  attributes: GameAttribute[];
  // Active entries, by id
  entries: Entry[];
  // Every entry including soft-deleted ones, so past guesses still resolve
  all: Entry[];
  // Active entries missing a value: while any are, the game is paused
  incomplete: number;
}

// SQL true when the game aliased `g` has an active entry missing a value (no value rows for a
// non-Image attribute; blanks are never stored), or, in a Blur game, missing its photo or its
// square order, or a Quiz question missing its answer. Such a game is paused.
export const HAS_MISSING_VALUES = `(case when g.kind = 'quiz' then exists (
  select 1 from entries e where e.game_id = g.id and e.deleted_at is null and e.quiz is null)
when g.kind = 'blur' then exists (
  select 1 from entries e
  where e.game_id = g.id and e.deleted_at is null and (e.photo_url = '' or e.blur_order is null))
else exists (
  select 1 from entries e join attributes a on a.game_id = e.game_id
  where e.game_id = g.id and e.deleted_at is null and a.type <> 'image' and not exists (
    select 1 from entry_values v where v.entry_id = e.id and v.attribute_id = a.id)) end)`;

// SQL true when the game aliased `g` is one the gallery shows: approved, with enough active
// entries (MIN_ENTRIES for a classic game, one otherwise) and none missing a value
export const IN_GALLERY = `(g.status = 'approved' and not ${HAS_MISSING_VALUES}
  and (select count(*) from entries n where n.game_id = g.id and n.deleted_at is null)
    >= case when g.kind = 'classic' then ${MIN_ENTRIES} else 1 end)`;

// An entry that pauses its game: a value missing, or in a Blur game its photo or square order
export const isIncomplete = (
  game: GameRow,
  roster: readonly GameAttribute[],
  entry: Entry,
): boolean =>
  game.kind === "quiz"
    ? entry.quiz === undefined
    : game.kind === "blur"
      ? entry.photo === "" || entry.blurOrder === undefined
      : !hasAllValues(roster, entry.values);

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
    blurOrder: number[] | null;
    quiz: QuizSpec | null;
  }>(
    `select id::int, name, photo_url as photo, deleted_at is not null as deleted,
       blur_order::int[] as "blurOrder", quiz
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
  const attrs = attributes.rows.map(({ name, type }) => ({ name, type }));
  const all = entries.rows.map(
    ({ id, name, photo, blurOrder, quiz }): Entry => {
      const values = attributes.rows.map((attr) => cell(id, attr));
      return {
        id,
        name,
        photo: game.kind === "classic" ? firstImage(attrs, values) : photo,
        values,
        ...(game.kind === "blur" && blurOrder && { blurOrder }),
        ...(game.kind === "quiz" && quiz && { quiz }),
      };
    },
  );
  const active = all.filter((_, i) => !entries.rows[i]!.deleted);
  return {
    attributes: attrs,
    entries: active,
    all,
    incomplete: active.filter((entry) => isIncomplete(game, attrs, entry))
      .length,
  };
}

export interface GalleryCard {
  slug: string;
  name: string;
  description: string;
  cover: string;
  // Banner collage photos of active entries, by id; only for a game without a cover. A Blur
  // game's photos are its answers, so it gets blurred tiles instead (`blurTileUrl`).
  photos: string[];
  entryCount: number;
  kind: GameKind;
}

// SQL for the first Image value of the entry aliased `alias` (null when it has none)
const FIRST_IMAGE = (alias: string): string =>
  `(select v.value from entry_values v join attributes a on a.id = v.attribute_id
     where v.entry_id = ${alias}.id and a.type = 'image' order by a.position, a.id limit 1)`;

// Which gallery games a list shows: all of them, one owner's, or one playlist's in its order
export type GalleryScope =
  | { ownerId: number; playlistId?: never }
  | { playlistId: number; ownerId?: never }
  | Record<string, never>;

// Approved games with enough active entries (MIN_ENTRIES, one for a Blur game) and none missing
// a value: the original first, then newest first. A scope narrows them to an owner's (newest first) or a playlist's.
export async function listGallery(
  q: Q,
  scope: GalleryScope = {},
): Promise<GalleryCard[]> {
  const inPlaylist = scope.playlistId !== undefined;
  const narrowedBy = [scope.playlistId ?? scope.ownerId].filter(
    (id) => id !== undefined,
  );
  const { rows } = await q.query<GalleryCard>(
    `select g.slug, g.name, g.description, g.cover_url as cover,
       case when g.cover_url = '' then array(
         select x.photo from (
           select p.id, coalesce(nullif(p.photo_url, ''), ${FIRST_IMAGE("p")}) as photo
           from entries p where p.game_id = g.id and p.deleted_at is null) x
         where x.photo is not null order by x.id limit $2
       ) else '{}'::text[] end as photos,
       count(e.id)::int as "entryCount", g.kind
     from games g join entries e on e.game_id = g.id and e.deleted_at is null
     ${inPlaylist ? "join playlist_games pl on pl.game_id = g.id and pl.playlist_id = $3" : ""}
     where g.status = 'approved' and not ${HAS_MISSING_VALUES}
       ${scope.ownerId !== undefined ? "and g.owner_id = $3" : ""}
     group by g.id${inPlaylist ? ", pl.position" : ""} having count(e.id) >= case when g.kind = 'classic' then $1 else 1 end
     order by ${
       inPlaylist
         ? "pl.position"
         : scope.ownerId !== undefined
           ? "g.created_at desc, g.id desc"
           : "g.slug = 'petdle' desc, g.created_at desc, g.id desc"
     }`,
    [MIN_ENTRIES, MAX_TILES, ...narrowedBy],
  );
  return rows.map((card) =>
    card.kind === "blur"
      ? {
          ...card,
          photos: card.photos.map((_, i) => blurTileUrl(card.slug, i)),
        }
      : card,
  );
}

// Tile n of a Blur game's banner collage: its nth entry photo with a photo, blurred (ADR 0019)
export const blurTileUrl = (slug: string, n: number): string =>
  `/api/games/${encodeURIComponent(slug)}/tile/${n}`;

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
  kind: GameKind = "classic",
): Promise<string | "slug_taken"> {
  const insert = async (candidate: string): Promise<boolean> =>
    (
      await q.query(
        `insert into games (slug, name, owner_id, start_date, kind) values ($1, $2, $3, $4, $5)
         on conflict (slug) do nothing`,
        [candidate, name, ownerId, startDate, kind],
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
  // Blur games only
  blurTries?: number;
}

// The lifecycle edit kind of a patch: text, image or try count changes reset status, a skip
// period alone does not
export function patchKind(game: GameRow, patch: GamePatch): EditKind {
  const next = { ...game, ...patch };
  return next.name !== game.name ||
    next.description !== game.description ||
    next.blurTries !== game.blurTries
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
       blur_tries = $6, updated_at = now() where id = $1`,
    [
      game.id,
      next.name,
      next.description,
      next.coverUrl,
      next.skipPeriod,
      next.blurTries,
    ],
  );
  return next.coverUrl === game.coverUrl ? null : game.coverUrl;
}
