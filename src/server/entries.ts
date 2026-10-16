// Entry editing (spec #66): add, change and soft-delete the entries of one game.
import type pg from "pg";
import { listAttributes, type GameRow } from "./games.ts";

export const MAX_ENTRY_NAME = 60;
export const MAX_LIST_ITEMS = 20;

export interface EntryRow {
  id: number;
  name: string;
  photo: string;
  // Attribute id to its items (Text has at most one; empty means no value)
  values: Record<string, string[]>;
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
  return rows.map((r) => ({ ...r, values: r.values ?? {} }));
}

export interface EntryInput {
  name?: string;
  photo?: string;
  values?: Record<string, string[]>;
}

const RESET_STATUS = `update games set updated_at = now(),
  status = case when status in ('approved', 'rejected') then 'pending' else status end
  where id = $1`;

// Creates the entry (`id` undefined) or changes it. Any edit sends an approved or
// rejected game back to pending. `replacedPhoto` is the file the caller should delete.
export async function saveEntry(
  pool: pg.Pool,
  game: GameRow,
  id: number | undefined,
  input: EntryInput,
): Promise<
  | { id: number; replacedPhoto: string | null }
  | "invalid"
  | "exists"
  | "not_found"
> {
  const client = await pool.connect();
  const fail = async <T>(reason: T): Promise<T> => {
    await client.query("rollback");
    return reason;
  };
  try {
    await client.query("begin");
    // Serializes edits of one game so the name check holds
    await client.query("select 1 from games where id = $1 for update", [
      game.id,
    ]);
    const current = (
      await client.query<{ name: string; photo: string }>(
        `select name, photo_url as photo from entries
         where id = $1 and game_id = $2 and deleted_at is null`,
        [id ?? 0, game.id],
      )
    ).rows[0];
    if (id !== undefined && !current) {
      return await fail("not_found" as const);
    }
    const name = input.name ?? current?.name ?? "";
    const photo = input.photo ?? current?.photo ?? "";
    const clash = await client.query(
      `select 1 from entries where game_id = $1 and deleted_at is null and id <> $2
         and lower(name) = lower($3)`,
      [game.id, id ?? 0, name],
    );
    if (clash.rowCount) {
      return await fail("exists" as const);
    }
    const attrs = await listAttributes(client, game);
    for (const [attrId, items] of Object.entries(input.values ?? {})) {
      const attr = attrs.find((a) => String(a.id) === attrId);
      if (!attr || (attr.type === "text" && items.length > 1)) {
        return await fail("invalid" as const);
      }
    }
    let entryId = id;
    if (entryId === undefined) {
      entryId = (
        await client.query<{ id: number }>(
          "insert into entries (game_id, name, photo_url) values ($1, $2, $3) returning id::int",
          [game.id, name, photo],
        )
      ).rows[0]!.id;
    } else {
      await client.query(
        "update entries set name = $2, photo_url = $3 where id = $1",
        [entryId, name, photo],
      );
    }
    for (const [attrId, items] of Object.entries(input.values ?? {})) {
      await client.query(
        "delete from entry_values where entry_id = $1 and attribute_id = $2",
        [entryId, attrId],
      );
      await client.query(
        `insert into entry_values (entry_id, attribute_id, position, value)
         select $1, $2, n - 1, v from unnest($3::text[]) with ordinality as t (v, n)`,
        [entryId, attrId, items],
      );
    }
    await client.query(RESET_STATUS, [game.id]);
    await client.query("commit");
    return {
      id: entryId,
      replacedPhoto: current && current.photo !== photo ? current.photo : null,
    };
  } catch (err) {
    await client.query("rollback");
    throw err;
  } finally {
    client.release();
  }
}

// Soft delete: the entry leaves autocomplete and draws, past guesses and history still resolve.
// Its photo stays: history still shows it and the nightly sweep counts it as referenced.
export async function deleteEntry(
  pool: pg.Pool,
  game: GameRow,
  id: number,
): Promise<boolean> {
  const { rowCount } = await pool.query(
    "update entries set deleted_at = now() where id = $1 and game_id = $2 and deleted_at is null",
    [id, game.id],
  );
  if (rowCount === 1) {
    await pool.query(RESET_STATUS, [game.id]);
  }
  return rowCount === 1;
}
