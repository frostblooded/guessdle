// A game's attributes: listing them and the editor's changes to them.
import type pg from "pg";
import { MAX_ATTRIBUTES } from "../game/limits.ts";
import type { AttributeType } from "../game/game.ts";
import type { GameRow } from "./games.ts";

type Q = Pick<pg.Pool, "query">;

// Abuse caps (spec #66); entry value caps live with entry editing

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

// The whole attribute list as the editor's Save sends it: kept ones by id, new ones without
export interface AttributeDraft {
  id?: number | undefined;
  name: string;
  type: AttributeType;
}

// Replaces a game's attributes with `drafts`, in that order: missing ids are removed, a changed
// type erases that attribute's values, new ones are added. All or nothing, in the caller's game
// transaction (lifecycle.edit). "noop" when nothing changed, "reorder" when only the order did
// (which keeps the game's status).
export async function saveAttributes(
  client: Q,
  game: GameRow,
  drafts: readonly AttributeDraft[],
): Promise<
  "ok" | "noop" | "reorder" | "invalid" | "attribute_exists" | "not_found"
> {
  const attrs = await listAttributes(client, game);
  const ids = drafts.flatMap((d) => (d.id === undefined ? [] : [d.id]));
  const names = drafts.map((d) => d.name.toLowerCase());
  if (drafts.length > MAX_ATTRIBUTES || new Set(ids).size !== ids.length) {
    return "invalid";
  }
  if (ids.some((id) => !attrs.some((a) => a.id === id))) {
    return "not_found";
  }
  if (new Set(names).size !== names.length) {
    return "attribute_exists";
  }
  const unchanged =
    drafts.length === attrs.length &&
    drafts.every(
      (d, i) =>
        d.id === attrs[i]!.id &&
        d.name === attrs[i]!.name &&
        d.type === attrs[i]!.type,
    );
  if (unchanged) {
    return "noop";
  }
  const reordered =
    drafts.length === attrs.length &&
    drafts.every((d) =>
      attrs.some(
        (a) => a.id === d.id && a.name === d.name && a.type === d.type,
      ),
    );
  const removed = attrs.filter((a) => !ids.includes(a.id)).map((a) => a.id);
  const retyped = attrs
    .filter((a) => drafts.some((d) => d.id === a.id && d.type !== a.type))
    .map((a) => a.id);
  await client.query("delete from attributes where id = any($1::bigint[])", [
    removed,
  ]);
  await client.query(
    "delete from entry_values where attribute_id = any($1::bigint[])",
    [retyped],
  );
  for (const [position, d] of drafts.entries()) {
    await client.query(
      d.id === undefined
        ? "insert into attributes (game_id, name, type, position) values ($1, $2, $3, $4)"
        : "update attributes set name = $2, type = $3, position = $4 where id = $1",
      [d.id ?? game.id, d.name, d.type, position],
    );
  }
  return reordered ? "reorder" : "ok";
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

// Adds, renames, retypes or removes an attribute. Removing or retyping hard-deletes its values,
// which pauses the game until every entry is filled in again. A real change is "ok" (the
// lifecycle then resets the status), a rename to the same name is "noop".
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
      if (type !== attr.type) {
        await client.query("delete from entry_values where attribute_id = $1", [
          id,
        ]);
      }
      await client.query(
        "update attributes set name = $2, type = $3 where id = $1",
        [id, name, type],
      );
    }
  }
  return changed ? "ok" : "noop";
}
