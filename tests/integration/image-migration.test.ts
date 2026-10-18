import assert from "node:assert/strict";
import { copyFile, mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, it } from "vitest";
import { MIGRATIONS_DIR } from "../../src/server/main.ts";
import { migrate } from "../../src/server/migrate.ts";
import { startDb } from "./postgres.ts";
import type { TestDb } from "./postgres.ts";

const IMAGE_MIGRATION = "013_image_attributes.sql";

// Migration 013 on games made before it: classic photos become Photo Image values
describe("the Image attribute migration", () => {
  let db: TestDb;
  let dir: string;
  const attrs = async (slug: string): Promise<unknown[]> =>
    (
      await db.pool.query(
        `select a.name, a.type from attributes a join games g on g.id = a.game_id
         where g.slug = $1 order by a.position`,
        [slug],
      )
    ).rows;
  const photos = async (slug: string): Promise<unknown[]> =>
    (
      await db.pool.query(
        `select e.name, e.photo_url as photo, v.value as image
         from entries e join games g on g.id = e.game_id
         left join entry_values v on v.entry_id = e.id
           and v.attribute_id in (select id from attributes where type = 'image')
         where g.slug = $1 order by e.id`,
        [slug],
      )
    ).rows;

  beforeAll(async () => {
    db = await startDb();
    dir = await mkdtemp(join(tmpdir(), "migrations-"));
    const files = (await readdir(MIGRATIONS_DIR)).filter(
      (f) => f.endsWith(".sql") && Number(f.split("_")[0]) < 13,
    );
    for (const f of files) {
      await copyFile(join(MIGRATIONS_DIR, f), join(dir, f));
    }
    await migrate(db.pool, dir);
    await db.pool.query(
      `insert into games (slug, name, start_date, kind) values
         ('cls', 'Classic', '2026-10-16', 'classic'),
         ('clash', 'Clash', '2026-10-16', 'classic'),
         ('blr', 'Blur', '2026-10-16', 'blur')`,
    );
    await db.pool.query(
      `insert into attributes (game_id, name, type, position)
       select id, 'Owner', 'text', 0 from games where slug = 'cls'
       union all select id, 'photo', 'text', 0 from games where slug = 'clash'`,
    );
    await db.pool.query(
      `insert into entries (game_id, name, photo_url, deleted_at)
       select id, 'A', '/uploads/a.webp', null::timestamptz from games where slug = 'cls'
       union all select id, 'B', '', null from games where slug = 'cls'
       union all select id, 'C', '/uploads/c.webp', now() from games where slug = 'cls'
       union all select id, 'D', '/uploads/d.webp', null from games where slug = 'blr'`,
    );
    await copyFile(
      join(MIGRATIONS_DIR, IMAGE_MIGRATION),
      join(dir, IMAGE_MIGRATION),
    );
    assert.deepEqual(await migrate(db.pool, dir), [IMAGE_MIGRATION]);
  });
  afterAll(async () => {
    await db.stop();
    await rm(dir, { recursive: true, force: true });
  });

  it("puts a Photo Image attribute first in every classic game", async () => {
    assert.deepEqual(await attrs("cls"), [
      { name: "Photo", type: "image" },
      { name: "Owner", type: "text" },
    ]);
  });

  it("names it Entry photo when the game already has a Photo attribute", async () => {
    assert.deepEqual(await attrs("clash"), [
      { name: "Entry photo", type: "image" },
      { name: "photo", type: "text" },
    ]);
  });

  it("moves each photo, deleted entries' too, and leaves a blank photo blank", async () => {
    assert.deepEqual(await photos("cls"), [
      { name: "A", photo: "", image: "/uploads/a.webp" },
      { name: "B", photo: "", image: null },
      { name: "C", photo: "", image: "/uploads/c.webp" },
    ]);
  });

  it("leaves a Blur game's images alone", async () => {
    assert.deepEqual(await attrs("blr"), []);
    assert.deepEqual(await photos("blr"), [
      { name: "D", photo: "/uploads/d.webp", image: null },
    ]);
  });
});
