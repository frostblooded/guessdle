import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import type pg from "pg";

const MIGRATION = /^(\d+)_.+\.sql$/;
const LOCK_KEY = 5_150_001; // arbitrary; serialises runners across API replicas

// Applies unapplied `<number>_name.sql` files in numeric order, one transaction
// per file, and returns the names it applied.
export async function migrate(pool: pg.Pool, dir: string): Promise<string[]> {
  const files = (await readdir(dir))
    .filter((f) => MIGRATION.test(f))
    .sort(
      (a, b) =>
        Number(a.match(MIGRATION)?.[1]) - Number(b.match(MIGRATION)?.[1]),
    );
  const applied: string[] = [];
  const client = await pool.connect();
  try {
    await client.query("select pg_advisory_lock($1)", [LOCK_KEY]);
    await client.query(
      "create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())",
    );
    const done = new Set(
      (
        await client.query<{ name: string }>(
          "select name from schema_migrations",
        )
      ).rows.map((r) => r.name),
    );
    for (const file of files.filter((f) => !done.has(f))) {
      const sql = await readFile(join(dir, file), "utf8");
      try {
        await client.query("begin");
        await client.query(sql);
        await client.query("insert into schema_migrations (name) values ($1)", [
          file,
        ]);
        await client.query("commit");
      } catch (err) {
        await client.query("rollback");
        throw err;
      }
      applied.push(file);
    }
  } finally {
    await client
      .query("select pg_advisory_unlock($1)", [LOCK_KEY])
      .catch(() => {});
    client.release();
  }
  return applied;
}
