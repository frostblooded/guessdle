// One-off (#71): runs the repo's photos/*.jpg through the upload pipeline and points Petdle's entries at the results.
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type pg from "pg";
import { processImage, storeWebp } from "./images.ts";
import type { ImageKind } from "./images.ts";
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

// Entries still on /photos/<slug>.jpg are converted; entries already moved are skipped, so reruns are safe.
// `missing` lists slugs with no file in photosDir (left untouched).
export async function importPhotos(
  pool: pg.Pool,
  options: ImportOptions,
): Promise<{ imported: number; missing: string[] }> {
  const { rows } = await pool.query<{ id: number; photo_url: string }>(
    "select e.id, e.photo_url from entries e join games g on g.id = e.game_id where g.slug = 'petdle' and e.photo_url like '/photos/%' order by e.id",
  );
  let imported = 0;
  const missing: string[] = [];
  for (const row of rows) {
    const file = row.photo_url.slice("/photos/".length);
    try {
      const url = await store(
        pool,
        options,
        join(options.photosDir, file),
        "photo",
      );
      await pool.query("update entries set photo_url = $1 where id = $2", [
        url,
        row.id,
      ]);
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
