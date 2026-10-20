// Game, attribute and entry data: the one seam between routes and the tables.
import type pg from "pg";
import type { AttributeValue } from "../game/correctness.ts";
import { firstImage, type Entry, type GameAttribute } from "../game/game.ts";
import { slugError } from "../game/slug.ts";
import type { GameKind } from "../game/blur.ts";
import type { QuizSpec } from "../game/quiz.ts";
import { listAttributes, type AttributeRow } from "./attributes.ts";
import { isAnswerable, isIncomplete } from "./completeness.ts";
import { KINDS } from "../game/kinds.ts";
import type { EditKind } from "./lifecycle.ts";
import { OWNER_BANNED } from "./users.ts";

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
  // Blur and Sequence games: the number of tries (a Sequence game's photos per entry)
  blurTries: number;
  // Its owner is banned: hidden from all but the owner and admins
  ownerBanned: boolean;
}

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
       skip_period as "skipPeriod", kind, blur_tries as "blurTries",
       ${OWNER_BANNED} as "ownerBanned"
     from games g where ${where} = $1`,
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
  // Active entries missing a value: while any are, the game is paused. A Sequence game counts
  // its entries only while none of them may be the answer.
  incomplete: number;
  // Active entries a day's answer is drawn from: all of them, but in a Sequence game only
  // those with every photo
  answerIds: number[];
}

// A game's attributes and entries with their values
export async function loadRoster(q: Q, game: GameRow): Promise<Roster> {
  const attributes = await listAttributes(q, game);
  const entries = await q.query<{
    id: number;
    name: string;
    photo: string;
    deleted: boolean;
    blurOrder: number[] | null;
    shots: string[];
    description: string;
    quiz: QuizSpec | null;
  }>(
    `select id::int, name, photo_url as photo, deleted_at is not null as deleted,
       blur_order::int[] as "blurOrder", shots, description, quiz
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
  const cell = (entryId: number, attr: AttributeRow) => {
    const list = byCell.get(`${entryId}:${attr.id}`) ?? [];
    return (attr.type === "list" ? list : (list[0] ?? "")) as AttributeValue;
  };
  const attrs = attributes.map(({ name, type }) => ({ name, type }));
  const kind = KINDS[game.kind];
  const all = entries.rows.map(
    ({ id, name, photo, description, blurOrder, shots, quiz }): Entry => {
      const values = attributes.map((attr) => cell(id, attr));
      return {
        id,
        name,
        photo: kind.photo ? photo : firstImage(attrs, values),
        values,
        description,
        ...(kind.blurOrder && blurOrder && { blurOrder }),
        ...(kind.shots && { shots }),
        ...(kind.quiz && quiz && { quiz }),
      };
    },
  );
  const active = all.filter((_, i) => !entries.rows[i]!.deleted);
  const answerIds = active
    .filter((entry) => isAnswerable(game, attrs, entry))
    .map((entry) => entry.id);
  return {
    attributes: attrs,
    entries: active,
    all,
    incomplete: kind.pauses
      ? active.filter((entry) => isIncomplete(game, attrs, entry)).length
      : answerIds.length === 0
        ? active.length
        : 0,
    answerIds,
  };
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
  kind: GameKind = "classic",
): Promise<string | "slug_taken"> {
  const insert = async (candidate: string): Promise<boolean> =>
    (
      await q.query(
        `insert into games (slug, name, owner_id, start_date, kind, blur_tries)
         values ($1, $2, $3, $4, $5, $6) on conflict (slug) do nothing`,
        [candidate, name, ownerId, startDate, kind, KINDS[kind].tries],
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
  // Blur and Sequence games only
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
