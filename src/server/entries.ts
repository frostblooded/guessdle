// Entry editing (spec #66): add, change and soft-delete the entries of one game.
import type pg from "pg";
import { parseNumberValue } from "../game/number.ts";
import { partsFit, type ImageSize, type ZoomPart } from "../game/zoom.ts";
import { listAttributes, loadParts, type GameRow } from "./games.ts";

export interface EntryRow {
  id: number;
  name: string;
  photo: string;
  // Attribute id to its items (Text has at most one; empty means no value)
  values: Record<string, string[]>;
  // Zoom games only: the photo's zoomed parts, closest first
  parts?: ZoomPart[];
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
  }>(
    `select e.id::int, e.name, e.photo_url as photo,
       (select jsonb_object_agg(attribute_id, items) from (
          select attribute_id, jsonb_agg(value order by position) as items
          from entry_values where entry_id = e.id group by attribute_id) v) as values
     from entries e where e.game_id = $1 and e.deleted_at is null order by e.id`,
    [game.id],
  );
  const parts = game.kind === "zoom" ? await loadParts(q, game) : null;
  return rows.map((r) => ({
    ...r,
    values: r.values ?? {},
    ...(parts && { parts: parts.get(r.id) ?? [] }),
  }));
}

export interface EntryInput {
  name?: string;
  photo?: string;
  values?: Record<string, string[]>;
  parts?: ZoomPart[];
}

// The pixel size of a stored upload, null when there is no such image
export type ImageSizeOf = (url: string) => Promise<ImageSize | null>;

// Creates the entry (`id` undefined) or changes it. Every attribute needs a value once saved,
// from the input or already stored; Number values are stored as parseNumberValue gives them.
// A Zoom game's entry instead needs its photo and exactly the game's count of parts inside it;
// a new photo needs new parts.
// Runs in the caller's game transaction (lifecycle.edit), which applies the status rule.
// `replacedPhoto` is the file the caller should delete.
export async function saveEntry(
  tx: pg.PoolClient,
  game: GameRow,
  id: number | undefined,
  input: EntryInput,
  sizeOf: ImageSizeOf = async () => null,
): Promise<
  | { id: number; replacedPhoto: string | null }
  | "invalid"
  | "entry_exists"
  | "not_found"
  | "missing_values"
  | "not_a_number"
  | "missing_parts"
> {
  const current = (
    await tx.query<{ name: string; photo: string }>(
      `select name, photo_url as photo from entries
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
  if (clash.rowCount) {
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
  if (!attrs.every((a) => filled(String(a.id)))) {
    return "missing_values";
  }
  if (game.kind === "zoom") {
    const kept = input.parts === undefined && photo === (current?.photo ?? "");
    if (!kept) {
      const parts = input.parts ?? [];
      const size = photo === "" ? null : await sizeOf(photo);
      if (!size || parts.length !== game.zoomParts) {
        return "missing_parts";
      }
      if (!partsFit(parts, size)) {
        return "invalid";
      }
    } else if (id === undefined) {
      return "missing_parts";
    }
  } else if (input.parts !== undefined) {
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
  if (input.parts !== undefined) {
    await tx.query("delete from entry_zoom_parts where entry_id = $1", [
      entryId,
    ]);
    await tx.query(
      `insert into entry_zoom_parts (entry_id, position, x, y, size)
       select $1, n - 1, x, y, s
       from unnest($2::int[], $3::int[], $4::int[]) with ordinality as t (x, y, s, n)`,
      [
        entryId,
        input.parts.map((p) => p.x),
        input.parts.map((p) => p.y),
        input.parts.map((p) => p.size),
      ],
    );
  }
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
    replacedPhoto: current && current.photo !== photo ? current.photo : null,
  };
}

// Soft delete: the entry leaves autocomplete and draws, past guesses and history still resolve.
// Its photo stays: history still shows it and the nightly sweep counts it as referenced.
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
