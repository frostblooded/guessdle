// Upload quota rows (spec #66); references, deletion and the sweep live in upload-refs.ts.
import type pg from "pg";

export const DEFAULT_UPLOAD_QUOTA_BYTES = 200 * 1024 * 1024;

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
