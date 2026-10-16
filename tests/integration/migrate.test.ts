import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, beforeEach, describe, it } from "node:test";
import { migrate } from "../../src/server/migrate.ts";
import { startDb } from "./postgres.ts";
import type { TestDb } from "./postgres.ts";

describe("migrate", () => {
  let db: TestDb;
  let dir: string;

  before(async () => {
    db = await startDb();
  });
  after(async () => {
    await db.stop();
  });
  beforeEach(async () => {
    await db.pool.query("drop schema public cascade; create schema public");
    dir = await mkdtemp(join(tmpdir(), "migrations-"));
  });

  const add = (name: string, sql: string): Promise<void> =>
    writeFile(join(dir, name), sql);
  const tables = async (): Promise<string[]> =>
    (
      await db.pool.query<{ table_name: string }>(
        "select table_name from information_schema.tables where table_schema = 'public' order by 1",
      )
    ).rows.map((r) => r.table_name);

  it("applies files in numeric order and reports them", async () => {
    await add("10_third.sql", "insert into t values ('third')");
    await add("2_second.sql", "insert into t values ('second')");
    await add("1_first.sql", "create table t (v text)");
    assert.deepEqual(await migrate(db.pool, dir), [
      "1_first.sql",
      "2_second.sql",
      "10_third.sql",
    ]);
    const rows = await db.pool.query("select v from t");
    assert.deepEqual(
      rows.rows.map((r) => r.v),
      ["second", "third"],
    );
  });

  it("is a no-op when run again, and applies only new files", async () => {
    await add("1_a.sql", "create table a (id int)");
    await migrate(db.pool, dir);
    assert.deepEqual(await migrate(db.pool, dir), []);
    await add("2_b.sql", "create table b (id int)");
    assert.deepEqual(await migrate(db.pool, dir), ["2_b.sql"]);
    assert.deepEqual(await tables(), ["a", "b", "schema_migrations"]);
  });

  it("rolls back a failing file entirely, keeps earlier ones, and stops", async () => {
    await add("1_ok.sql", "create table ok (id int)");
    await add("2_bad.sql", "create table half (id int); select boom();");
    await add("3_never.sql", "create table never (id int)");
    await assert.rejects(migrate(db.pool, dir), /boom/);
    assert.deepEqual(await tables(), ["ok", "schema_migrations"]);
    const done = await db.pool.query("select name from schema_migrations");
    assert.deepEqual(
      done.rows.map((r) => r.name),
      ["1_ok.sql"],
    );
  });

  it("retries a previously failed file once it is fixed", async () => {
    await add("1_bad.sql", "select boom()");
    await assert.rejects(migrate(db.pool, dir));
    await add("1_bad.sql", "create table fixed (id int)");
    assert.deepEqual(await migrate(db.pool, dir), ["1_bad.sql"]);
  });

  it("ignores files that are not numbered .sql migrations", async () => {
    await add("README.md", "not sql");
    await add(".gitkeep", "");
    await add("x_notnumbered.sql", "select boom()");
    assert.deepEqual(await migrate(db.pool, dir), []);
  });

  it("applies once when two runners start together", async () => {
    await add("1_a.sql", "create table a (id int)");
    const results = await Promise.all([
      migrate(db.pool, dir),
      migrate(db.pool, dir),
    ]);
    assert.deepEqual(results.flat(), ["1_a.sql"]);
  });

  it("applies the repo's real migrations", async () => {
    await migrate(db.pool, join(import.meta.dirname, "../../db/migrations"));
  });

  after(async () => {
    await rm(dir, { recursive: true, force: true });
  });
});
