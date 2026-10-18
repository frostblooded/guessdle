import assert from "node:assert/strict";
import { mkdtemp, readdir, rm, utimes, writeFile } from "node:fs/promises";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, it } from "vitest";
import { createApp } from "../../src/server/app.ts";
import { MIGRATIONS_DIR } from "../../src/server/main.ts";
import { migrate } from "../../src/server/migrate.ts";
import { uploadRefs } from "../../src/server/upload-refs.ts";
import type { Tutorial } from "../../src/game/tutorial.ts";
import { pid, SLUGS } from "./petdle.ts";
import { startDb } from "./postgres.ts";
import type { TestDb } from "./postgres.ts";

describe("the tutorial's frozen pet game copy", () => {
  let db: TestDb;
  let server: Server;
  let url: string;

  const tutorial = async (): Promise<{ status: number; body: Tutorial }> => {
    const res = await fetch(`${url}/api/tutorial`);
    return { status: res.status, body: (await res.json()) as Tutorial };
  };

  beforeAll(async () => {
    db = await startDb();
    await migrate(db.pool, MIGRATIONS_DIR);
    server = await new Promise<Server>((resolve) => {
      const s = createApp({ pool: db.pool }).listen(0, "127.0.0.1", () =>
        resolve(s),
      );
    });
    url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(async () => {
    server.close();
    await db.stop();
  });

  it("holds every pet game entry with its values, A to Z, with Ati as the secret", async () => {
    const { status, body } = await tutorial();
    assert.equal(status, 200);
    assert.deepEqual(body.attributes, [
      { name: "Colors", type: "list" },
      { name: "Owners", type: "list" },
    ]);
    assert.equal(body.entries.length, SLUGS.length);
    const names = body.entries.map((e) => e.name);
    assert.deepEqual(
      names,
      [...names].sort((a, b) => a.localeCompare(b)),
    );
    assert.equal(body.answerId, pid("ati"));
    assert.deepEqual(
      body.entries.find((e) => e.name === "Ati"),
      {
        id: pid("ati"),
        name: "Ati",
        photo: "/photos/ati.jpg",
        values: [["Black", "Orange", "White"], ["Niki"]],
      },
    );
  });

  it("does not change when the pet game's entries change", async () => {
    const before = await tutorial();
    await db.pool.query(
      "update entries set name = 'Atilla', photo_url = '/uploads/x.webp' where id = $1",
      [pid("ati")],
    );
    await db.pool.query("delete from entry_values where entry_id = $1", [
      pid("bela"),
    ]);
    await db.pool.query("update entries set deleted_at = now() where id = $1", [
      pid("cookie"),
    ]);
    await db.pool.query(
      "insert into entries (game_id, name) select id, 'Newbie' from games where slug = 'petdle'",
    );
    assert.deepEqual(await tutorial(), before);
  });

  it("keeps the files of the photos it uses", async () => {
    const dir = await mkdtemp(join(tmpdir(), "tutorial-"));
    try {
      const name = `${"ab".repeat(16)}.webp`;
      const photo = `/uploads/${name}`;
      await writeFile(join(dir, name), "x");
      const old = new Date(Date.now() - 3 * 24 * 3600 * 1000);
      await utimes(join(dir, name), old, old);
      await db.pool.query(
        `update tutorial set entries = jsonb_set(entries, '{0,photo}', to_jsonb($1::text))`,
        [photo],
      );
      const refs = uploadRefs(db.pool, dir);
      await refs.release([photo]);
      assert.deepEqual(await refs.sweep(new Date()), []);
      assert.deepEqual(await readdir(dir), [name]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("answers 404 when there is no copy", async () => {
    await db.pool.query("delete from tutorial");
    assert.equal((await tutorial()).status, 404);
  });
});
