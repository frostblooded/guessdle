// Entry editing (spec #66): add, change and soft-delete the entries of one game.
import type pg from "pg";
import { parseNumberValue } from "../game/number.ts";
import { listAttributes } from "./attributes.ts";
import type { GameRow } from "./games.ts";
import type { QuizSpec } from "../game/quiz.ts";

export interface EntryRow {
  id: number;
  name: string;
  // Blur games only: the entry's image (a classic entry's pictures are Image values)
  photo: string;
  // Attribute id to its items (Text has at most one; empty means no value)
  values: Record<string, string[]>;
  // Blur games only: the order the grid's squares clear in, once picked
  blurOrder?: number[] | null;
  // Quiz games only: the question's answer (its text is the name, its picture the photo)
  quiz?: QuizSpec | null;
}

export async function listEntries(
  q: Pick<pg.Pool, "query">,
  game: GameRow,
): Promise<EntryRow[]> {
  const { rows } = await q.query<{
    id: number;
    name: string;
    photo: string;
    values: Record<string, string[]> | null;
    blurOrder: number[] | null;
    quiz: QuizSpec | null;
  }>(
    `select e.id::int, e.name, e.photo_url as photo, e.blur_order::int[] as "blurOrder", e.quiz,
       (select jsonb_object_agg(attribute_id, items) from (
          select attribute_id, jsonb_agg(value order by position) as items
          from entry_values where entry_id = e.id group by attribute_id) v) as values
     from entries e where e.game_id = $1 and e.deleted_at is null order by e.id`,
    [game.id],
  );
  return rows.map(({ blurOrder, quiz, ...r }) => ({
    ...r,
    values: r.values ?? {},
    ...(game.kind === "blur" && { blurOrder }),
    ...(game.kind === "quiz" && { quiz }),
  }));
}

export interface EntryInput {
  name?: string;
  photo?: string;
  values?: Record<string, string[]>;
  blurOrder?: number[];
  quiz?: QuizSpec;
}

// Creates the entry (`id` undefined) or changes it. Every attribute but Image needs a value once
// saved, from the input or already stored; Number values are stored as parseNumberValue gives
// them, an Image value is one upload URL. A Blur game's entry instead needs its photo and a
// complete square order, sent or stored. A Quiz question needs its answer (quiz), sent or stored,
// may share its text with another and may have a picture; only Blur and Quiz entries have a photo.
// Runs in the caller's game transaction (lifecycle.edit), which applies the status rule.
// `replaced` lists the files the edit stopped using, for the caller to release.
export async function saveEntry(
  tx: pg.PoolClient,
  game: GameRow,
  id: number | undefined,
  input: EntryInput,
): Promise<
  | { id: number; replaced: string[] }
  | "invalid"
  | "entry_exists"
  | "not_found"
  | "missing_values"
  | "not_a_number"
  | "missing_order"
  | "missing_answer"
> {
  const current = (
    await tx.query<{
      name: string;
      photo: string;
      blurOrder: number[] | null;
      quiz: QuizSpec | null;
    }>(
      `select name, photo_url as photo, blur_order::int[] as "blurOrder", quiz from entries
       where id = $1 and game_id = $2 and deleted_at is null`,
      [id ?? 0, game.id],
    )
  ).rows[0];
  if (id !== undefined && !current) {
    return "not_found";
  }
  const name = input.name ?? current?.name ?? "";
  const photo = input.photo ?? current?.photo ?? "";
  const clash = await tx.query(
    `select 1 from entries where game_id = $1 and deleted_at is null and id <> $2
       and lower(name) = lower($3)`,
    [game.id, id ?? 0, name],
  );
  if (clash.rowCount && game.kind !== "quiz") {
    return "entry_exists";
  }
  const attrs = await listAttributes(tx, game);
  const values: Record<string, string[]> = {};
  for (const [attrId, items] of Object.entries(input.values ?? {})) {
    const attr = attrs.find((a) => String(a.id) === attrId);
    if (!attr || (attr.type !== "list" && items.length > 1)) {
      return "invalid";
    }
    const parsed = attr.type === "number" ? items.map(parseNumberValue) : items;
    if (parsed.some((v) => v === null)) {
      return "not_a_number";
    }
    values[attrId] = parsed as string[];
  }
  const stored = new Set(
    (
      await tx.query<{ attribute_id: string }>(
        "select distinct attribute_id::text from entry_values where entry_id = $1",
        [id ?? 0],
      )
    ).rows.map((r) => r.attribute_id),
  );
  const filled = (attrId: string): boolean =>
    attrId in values ? values[attrId]!.length > 0 : stored.has(attrId);
  if (!attrs.every((a) => a.type === "image" || filled(String(a.id)))) {
    return "missing_values";
  }
  if (game.kind === "classic" && input.photo !== undefined) {
    return "invalid";
  }
  if (game.kind !== "quiz" && input.quiz !== undefined) {
    return "invalid";
  }
  const quiz = input.quiz ?? current?.quiz ?? null;
  if (game.kind === "quiz" && quiz === null) {
    return "missing_answer";
  }
  if (game.kind === "blur") {
    const order = input.blurOrder ?? current?.blurOrder ?? null;
    if (photo === "" || order === null) {
      return "missing_order";
    }
  } else if (input.blurOrder !== undefined) {
    return "invalid";
  }
  let entryId = id;
  if (entryId === undefined) {
    entryId = (
      await tx.query<{ id: number }>(
        "insert into entries (game_id, name, photo_url) values ($1, $2, $3) returning id::int",
        [game.id, name, photo],
      )
    ).rows[0]!.id;
  } else {
    await tx.query(
      "update entries set name = $2, photo_url = $3 where id = $1",
      [entryId, name, photo],
    );
  }
  if (input.quiz !== undefined) {
    await tx.query("update entries set quiz = $2 where id = $1", [
      entryId,
      input.quiz,
    ]);
  }
  if (input.blurOrder !== undefined) {
    await tx.query("update entries set blur_order = $2 where id = $1", [
      entryId,
      input.blurOrder,
    ]);
  }
  const images = attrs
    .filter((a) => a.type === "image" && String(a.id) in values)
    .map((a) => a.id);
  const replaced = (
    await tx.query<{ value: string }>(
      `select value from entry_values where entry_id = $1 and attribute_id = any($2::bigint[])`,
      [entryId, images],
    )
  ).rows
    .map((r) => r.value)
    .filter((url) => !Object.values(values).some((v) => v.includes(url)));
  for (const [attrId, items] of Object.entries(values)) {
    await tx.query(
      "delete from entry_values where entry_id = $1 and attribute_id = $2",
      [entryId, attrId],
    );
    await tx.query(
      `insert into entry_values (entry_id, attribute_id, position, value)
       select $1, $2, n - 1, v from unnest($3::text[]) with ordinality as t (v, n)`,
      [entryId, attrId, items],
    );
  }
  return {
    id: entryId,
    replaced: [
      ...replaced,
      ...(current && current.photo !== photo ? [current.photo] : []),
    ],
  };
}

// Soft delete: the entry leaves autocomplete and draws, past guesses and history still resolve.
// Its pictures stay: history still shows them and the nightly sweep counts it as referenced.
export async function deleteEntry(
  q: Pick<pg.Pool, "query">,
  game: GameRow,
  id: number,
): Promise<boolean> {
  const { rowCount } = await q.query(
    "update entries set deleted_at = now() where id = $1 and game_id = $2 and deleted_at is null",
    [id, game.id],
  );
  return rowCount === 1;
}
