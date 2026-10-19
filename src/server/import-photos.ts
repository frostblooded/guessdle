// One-off (#71): runs the repo's photos/*.jpg through the upload pipeline and points Petdle's Image
// values at the results.
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type pg from "pg";
import { processImage, storeWebp } from "./images.ts";
import type { ImageKind } from "../game/crop.ts";
import { recordUpload } from "./upload-store.ts";

export interface ImportOptions {
  photosDir: string;
  uploadsDir: string;
  // Owner charged for the bytes (an uploads row needs a user)
  userId: number;
  // Optional image to become Petdle's cover
  coverFile?: string;
}

async function store(
  pool: pg.Pool,
  { uploadsDir, userId }: ImportOptions,
  file: string,
  kind: ImageKind,
): Promise<string> {
  const webp = await processImage(await readFile(file), kind);
  const url = await storeWebp(uploadsDir, webp);
  await recordUpload(pool, userId, url, webp.length, new Date());
  return url;
}

// Image values still on /photos/<slug>.jpg are converted; values already moved are skipped, so reruns are safe.
// `missing` lists slugs with no file in photosDir (left untouched).
export async function importPhotos(
  pool: pg.Pool,
  options: ImportOptions,
): Promise<{ imported: number; missing: string[] }> {
  const { rows } = await pool.query<{
    id: number;
    attributeId: number;
    url: string;
  }>(
    `select v.entry_id as id, v.attribute_id as "attributeId", v.value as url
     from entry_values v join attributes a on a.id = v.attribute_id
     join games g on g.id = a.game_id
     where g.slug = 'petdle' and a.type = 'image' and v.value like '/photos/%'
     order by v.entry_id, a.position`,
  );
  let imported = 0;
  const missing: string[] = [];
  for (const row of rows) {
    const file = row.url.slice("/photos/".length);
    try {
      const url = await store(
        pool,
        options,
        join(options.photosDir, file),
        "photo",
      );
      await pool.query(
        "update entry_values set value = $1 where entry_id = $2 and attribute_id = $3",
        [url, row.id, row.attributeId],
      );
      imported++;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") {
        throw e;
      }
      missing.push(file.replace(/\.jpg$/, ""));
    }
  }
  if (options.coverFile) {
    const url = await store(pool, options, options.coverFile, "cover");
    await pool.query("update games set cover_url = $1 where slug = 'petdle'", [
      url,
    ]);
  }
  return { imported, missing };
}
