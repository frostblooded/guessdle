import type pg from "pg";
import sharp from "sharp";
import { UPLOAD_SHAPES } from "../game/crop.ts";
import type { ImportFile } from "../game/import-file.ts";
import { MAX_ATTRIBUTES } from "../game/limits.ts";
import { listAttributes } from "./attributes.ts";
import type { GameRow } from "./games.ts";
import { ImageError, processImage } from "./images.ts";

export const IMPORT_PHOTO_ATTRIBUTE = "Photo";

export interface ImportResult {
  added: number;
  filled: number;
  unchanged: number;
  missingImages: number;
}

export type ImportOutcome =
  ImportResult | "import_type_clash" | "too_many_attributes";

export type FetchImage = (url: string) => Promise<Buffer>;

export async function squarePhoto(input: Buffer): Promise<Buffer> {
  const webp = await processImage(input, "photo");
  try {
    const { width = 1, height = 1 } = await sharp(webp).metadata();
    const side = Math.min(width, height, UPLOAD_SHAPES.photo.maxSide);
    return await sharp(webp)
      .resize(side, side, { fit: "cover", position: "attention" })
      .webp()
      .toBuffer();
  } catch {
    throw new ImageError("corrupt");
  }
}

export async function mapLimited<T, R>(
  items: readonly T[],
  limit: number,
  work: (item: T) => Promise<R>,
): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < items.length) {
      const index = next++;
      out[index] = await work(items[index]!);
    }
  };
  await Promise.all(Array.from({ length: limit }, worker));
  return out;
}

type Q = Pick<pg.PoolClient, "query">;

async function ensureAttributes(
  tx: Q,
  game: GameRow,
  file: ImportFile,
  needPhoto: boolean,
): Promise<
  | { ids: Map<string, number>; photoId: number | null }
  | "import_type_clash"
  | "too_many_attributes"
> {
  const existing = await listAttributes(tx, game);
  const find = (name: string) =>
    existing.find((a) => a.name.toLowerCase() === name.toLowerCase());
  if (
    file.attributes.some((a) => find(a.name) && find(a.name)!.type !== a.type)
  ) {
    return "import_type_clash";
  }
  const photo = existing.find((a) => a.type === "image");
  const missing = file.attributes.filter((a) => !find(a.name));
  const addPhoto = needPhoto && !photo && !find(IMPORT_PHOTO_ATTRIBUTE);
  if (existing.length + missing.length + (addPhoto ? 1 : 0) > MAX_ATTRIBUTES) {
    return "too_many_attributes";
  }
  const insert = async (name: string, type: string): Promise<number> =>
    (
      await tx.query<{ id: number }>(
        `insert into attributes (game_id, name, type, position)
         values ($1, $2, $3, coalesce((select max(position) + 1 from attributes where game_id = $1), 0))
         returning id::int`,
        [game.id, name, type],
      )
    ).rows[0]!.id;
  const ids = new Map<string, number>();
  for (const attribute of file.attributes) {
    ids.set(
      attribute.name,
      find(attribute.name)?.id ??
        (await insert(attribute.name, attribute.type)),
    );
  }
  const photoId =
    photo?.id ??
    (addPhoto ? await insert(IMPORT_PHOTO_ATTRIBUTE, "image") : null);
  return { ids, photoId };
}

export async function entriesNeedingImages(
  q: Q,
  game: GameRow,
  file: ImportFile,
): Promise<string[]> {
  const { rows } = await q.query<{ name: string }>(
    `select lower(e.name) as name from entries e
     where e.game_id = $1 and e.deleted_at is null and exists (
       select 1 from entry_values v join attributes a on a.id = v.attribute_id
       where v.entry_id = e.id and a.type = 'image' and v.value <> '')`,
    [game.id],
  );
  const pictured = new Set(rows.map((r) => r.name));
  return file.entries
    .filter((e) => e.image !== null && !pictured.has(e.name.toLowerCase()))
    .map((e) => e.name);
}

export async function importEntries(
  tx: Q,
  game: GameRow,
  file: ImportFile,
  photos: ReadonlyMap<string, string>,
): Promise<ImportOutcome> {
  const attrs = await ensureAttributes(tx, game, file, photos.size > 0);
  if (typeof attrs === "string") {
    return attrs;
  }
  const { rows: current } = await tx.query<{
    id: number;
    name: string;
    filled: string[];
  }>(
    `select e.id::int, lower(e.name) as name,
       coalesce(array_agg(distinct v.attribute_id::text) filter (where v.attribute_id is not null), '{}') as filled
     from entries e left join entry_values v on v.entry_id = e.id
     where e.game_id = $1 and e.deleted_at is null group by e.id`,
    [game.id],
  );
  const result: ImportResult = {
    added: 0,
    filled: 0,
    unchanged: 0,
    missingImages: 0,
  };
  const write = (entryId: number, attributeId: number, items: string[]) =>
    tx.query(
      `insert into entry_values (entry_id, attribute_id, position, value)
       select $1, $2, n - 1, v from unnest($3::text[]) with ordinality as t (v, n)`,
      [entryId, attributeId, items],
    );
  for (const entry of file.entries) {
    const found = current.find((c) => c.name === entry.name.toLowerCase());
    const filled = new Set(found?.filled ?? []);
    const entryId =
      found?.id ??
      (
        await tx.query<{ id: number }>(
          "insert into entries (game_id, name) values ($1, $2) returning id::int",
          [game.id, entry.name],
        )
      ).rows[0]!.id;
    let wrote = false;
    for (const attribute of file.attributes) {
      const attributeId = attrs.ids.get(attribute.name)!;
      if (!filled.has(String(attributeId))) {
        await write(entryId, attributeId, entry.values[attribute.name]!);
        wrote = true;
      }
    }
    const photo = photos.get(entry.name);
    if (
      attrs.photoId !== null &&
      photo !== undefined &&
      !filled.has(String(attrs.photoId))
    ) {
      await write(entryId, attrs.photoId, [photo]);
      wrote = true;
    }
    if (!found) {
      result.added++;
    } else if (wrote) {
      result.filled++;
    } else {
      result.unchanged++;
    }
  }
  return result;
}

const IMPORT_USER_AGENT =
  "Guessdle/1.0 (https://github.com/frostblooded/guessdle)";
const IMPORT_TIMEOUT_MS = 20_000;

export const fetchImportImage: FetchImage = async (url) => {
  const res = await fetch(url, {
    headers: { "User-Agent": IMPORT_USER_AGENT },
    redirect: "error",
    signal: AbortSignal.timeout(IMPORT_TIMEOUT_MS),
  });
  if (!res.ok) {
    throw new ImageError("unsupported");
  }
  return Buffer.from(await res.arrayBuffer());
};
