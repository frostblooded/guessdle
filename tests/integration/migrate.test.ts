import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";
import { migrate } from "../../src/server/migrate.ts";
import { startDb } from "./postgres.ts";
import type { TestDb } from "./postgres.ts";

describe("migrate", () => {
  let db: TestDb;
  let dir: string;

  beforeAll(async () => {
    db = await startDb();
  });
  afterAll(async () => {
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

  it("rewrites stored pet ids to entry ids when Petdle moves into games", async () => {
    const real = join(import.meta.dirname, "../../db/migrations");
    const { copyFile } = await import("node:fs/promises");
    for (const file of [
      "001_daily_answers.sql",
      "002_users_sessions.sql",
      "003_user_games.sql",
      "004_email_login.sql",
    ]) {
      await copyFile(join(real, file), join(dir, file));
    }
    await migrate(db.pool, dir);
    await db.pool.query(
      "insert into users (email, name, google_sub) values ('a@x.test', 'A', 'sub')",
    );
    await db.pool.query(
      "insert into user_guesses (user_id, day, pet_id) select id, '2026-10-16', p from users, unnest(array['todorka', 'ati', 'gone-pet']) p",
    );
    await db.pool.query(
      "insert into user_give_ups (user_id, day) select id, '2026-10-15' from users",
    );
    await db.pool.query(
      "update daily_answers set pet_id = 'dido', source = 'override' where day = '2025-08-16'",
    );
    await copyFile(join(real, "005_games.sql"), join(dir, "005_games.sql"));
    assert.deepEqual(await migrate(db.pool, dir), ["005_games.sql"]);

    const entry = async (name: string): Promise<number> =>
      (
        await db.pool.query("select id::int from entries where name = $1", [
          name,
        ])
      ).rows[0].id;
    const answers = await db.pool.query(
      "select to_char(day, 'YYYY-MM-DD') as day, entry_id::int, source from daily_answers order by day",
    );
    assert.equal(answers.rowCount, 428);
    assert.deepEqual(answers.rows[0], {
      day: "2025-08-15",
      entry_id: await entry("Patio"),
      source: "generated",
    });
    assert.deepEqual(answers.rows[1], {
      day: "2025-08-16",
      entry_id: await entry("Dido"),
      source: "override",
    });
    const guesses = await db.pool.query(
      "select entry_id::int from user_guesses order by seq",
    );
    assert.deepEqual(
      guesses.rows.map((r) => r.entry_id),
      [await entry("Todorka"), await entry("Ati")],
    );
    const giveUps = await db.pool.query(
      "select game_id = (select id from games where slug = 'petdle') as petdle from user_give_ups",
    );
    assert.deepEqual(giveUps.rows, [{ petdle: true }]);
    assert.equal(
      (
        await db.pool.query(
          "select 1 from information_schema.columns where column_name = 'pet_id'",
        )
      ).rowCount,
      0,
    );
  });

  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
  });
});
