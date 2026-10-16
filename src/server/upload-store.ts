// Upload bookkeeping (spec #66): per-user byte quota, delete on replace/remove, nightly sweep.
import { readdir, stat, unlink } from "node:fs/promises";
import { join } from "node:path";
import type pg from "pg";

export const DEFAULT_UPLOAD_QUOTA_BYTES = 200 * 1024 * 1024;
// Unreferenced files younger than this may belong to an editor session in progress
export const SWEEP_GRACE_MS = 24 * 3600 * 1000;
const URL_RE = /^\/uploads\/([0-9a-f]{32}\.webp)$/;

export async function usedBytes(
  pool: pg.Pool,
  userId: number,
): Promise<number> {
  const { rows } = await pool.query<{ sum: string }>(
    "select coalesce(sum(bytes), 0) as sum from uploads where user_id = $1",
    [userId],
  );
  return Number(rows[0]!.sum);
}

export async function recordUpload(
  pool: pg.Pool,
  userId: number,
  url: string,
  bytes: number,
  now: Date,
): Promise<void> {
  await pool.query(
    "insert into uploads (name, user_id, bytes, created_at) values ($1, $2, $3, $4)",
    [url.slice("/uploads/".length), userId, bytes, now],
  );
}

const unlinkQuiet = (path: string): Promise<void> =>
  unlink(path).catch((e: NodeJS.ErrnoException) => {
    if (e.code !== "ENOENT") {
      throw e;
    }
  });

// Deletes the file and frees its quota; a URL that is not one of ours is ignored
export async function removeUpload(
  pool: pg.Pool,
  dir: string,
  url: string | null | undefined,
): Promise<void> {
  const name = URL_RE.exec(url ?? "")?.[1];
  if (name) {
    await unlinkQuiet(join(dir, name));
    await pool.query("delete from uploads where name = $1", [name]);
  }
}

// URLs still used by content: game covers and entry photos (soft-deleted entries stay, they can be restored)
async function referencedUrls(pool: pg.Pool): Promise<Set<string>> {
  const { rows } = await pool.query<{ url: string }>(
    "select cover_url as url from games union select photo_url from entries",
  );
  return new Set(rows.map((r) => r.url));
}

// Deletes unreferenced files older than the grace period, and quota rows whose file is gone.
// Returns the file names removed.
export async function sweepUploads(
  pool: pg.Pool,
  dir: string,
  now: Date,
): Promise<string[]> {
  const keep = await referencedUrls(pool);
  const names = await readdir(dir).catch(() => [] as string[]);
  const removed: string[] = [];
  for (const name of names) {
    const url = `/uploads/${name}`;
    if (!URL_RE.test(url) || keep.has(url)) {
      continue;
    }
    const { mtimeMs } = await stat(join(dir, name));
    if (now.getTime() - mtimeMs >= SWEEP_GRACE_MS) {
      await removeUpload(pool, dir, url);
      removed.push(name);
    }
  }
  await pool.query(
    "delete from uploads where created_at < $1 and not (name = any($2))",
    [new Date(now.getTime() - SWEEP_GRACE_MS), names],
  );
  return removed;
}
