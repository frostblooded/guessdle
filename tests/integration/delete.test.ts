import assert from "node:assert/strict";
import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";
import { createApp } from "../../src/server/app.ts";
import { MIGRATIONS_DIR } from "../../src/server/main.ts";
import { migrate } from "../../src/server/migrate.ts";
import { startDb } from "./postgres.ts";
import type { TestDb } from "./postgres.ts";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Body = any;
const file = (n: number): string => `${String(n).repeat(32)}.webp`;

describe("deleting games and users", () => {
  let db: TestDb;
  let server: Server;
  let url: string;
  let dir: string;

  const request = async (
    method: string,
    path: string,
    cookie?: string,
  ): Promise<{ status: number; body: Body }> => {
    const res = await fetch(`${url}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(cookie && { Cookie: cookie }),
      },
    });
    return { status: res.status, body: await res.json() };
  };
  const login = async (email: string, admin = false): Promise<string> => {
    const res = await fetch(`${url}/api/test/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, admin }),
    });
    return res.headers.get("set-cookie")!.split(";")[0]!;
  };
  const idOf = async (email: string): Promise<number> =>
    (await db.pool.query("select id from users where email = $1", [email]))
      .rows[0].id;
  const count = async (sql: string): Promise<number> =>
    (await db.pool.query(sql)).rowCount ?? 0;
  const record = async (name: string, email: string): Promise<void> => {
    await writeFile(join(dir, name), "x");
    await db.pool.query(
      "insert into uploads (name, user_id, bytes, created_at) values ($1, $2, 1, now())",
      [name, await idOf(email)],
    );
  };
  // A game with a cover and one entry photo, both real files recorded against `email`
  const makeGame = async (
    slug: string,
    email: string,
    cover: string,
    photo: string,
  ): Promise<void> => {
    await record(cover, email);
    await record(photo, email);
    await db.pool.query(
      "insert into games (slug, name, owner_id, start_date, cover_url) values ($1, $2, $3, '2026-10-16', $4)",
      [slug, `Game ${slug}`, await idOf(email), `/uploads/${cover}`],
    );
    await db.pool.query(
      "insert into entries (game_id, name, photo_url) select id, 'E', $2 from games where slug = $1",
      [slug, `/uploads/${photo}`],
    );
  };
  const exists = async (slug: string): Promise<boolean> =>
    (await count(`select 1 from games where slug = '${slug}'`)) === 1;

  beforeAll(async () => {
    db = await startDb();
    await migrate(db.pool, MIGRATIONS_DIR);
    dir = await mkdtemp(join(tmpdir(), "delete-"));
    server = await new Promise<Server>((resolve) => {
      const s = createApp({
        pool: db.pool,
        uploadsDir: dir,
        testLogin: true,
        writeLimit: { max: 1000, windowMs: 60_000 },
      }).listen(0, "127.0.0.1", () => resolve(s));
    });
    url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(async () => {
    server.close();
    await db.stop();
    await rm(dir, { recursive: true, force: true });
  });
  let ann: string;
  let bob: string;
  let admin: string;
  beforeEach(async () => {
    await db.pool.query("delete from users");
    await db.pool.query("delete from games where slug <> 'petdle'");
    for (const f of await readdir(dir)) {
      await rm(join(dir, f));
    }
    ann = await login("ann@x.test");
    bob = await login("bob@x.test");
    admin = await login("root@x.test", true);
  });

  describe("owner deletes a game", () => {
    it("removes the game, its state and its upload files", async () => {
      await makeGame("zoo", "ann@x.test", file(1), file(2));
      await db.pool.query(
        `insert into user_guesses (user_id, game_id, entry_id, day)
         select u.id, g.id, e.id, '2026-10-16' from users u, games g, entries e
         where u.email = 'bob@x.test' and g.slug = 'zoo' and e.game_id = g.id`,
      );
      assert.equal(
        (await request("DELETE", "/api/games/zoo", ann)).status,
        200,
      );
      assert.equal(await exists("zoo"), false);
      assert.equal(await count("select 1 from entries where name = 'E'"), 0);
      assert.equal(await count("select 1 from user_guesses"), 0);
      assert.deepEqual(await readdir(dir), []);
      assert.equal(await count("select 1 from uploads"), 0);
    });

    it("refuses other users and anonymous callers, and 404s a missing game", async () => {
      await makeGame("zoo", "ann@x.test", file(1), file(2));
      // A hidden game does not reveal itself to strangers
      assert.equal(
        (await request("DELETE", "/api/games/zoo", bob)).status,
        404,
      );
      await db.pool.query(
        "insert into entries (game_id, name) select id, 'E2' from games where slug = 'zoo'",
      );
      await db.pool.query("update games set status = 'approved'");
      assert.equal((await request("DELETE", "/api/games/zoo")).status, 401);
      assert.equal(
        (await request("DELETE", "/api/games/zoo", bob)).status,
        403,
      );
      assert.equal(
        (await request("DELETE", "/api/games/nope", ann)).status,
        404,
      );
      assert.equal(await exists("zoo"), true);
      assert.equal((await readdir(dir)).length, 2);
    });
  });

  describe("admin lists all games", () => {
    it("lists every status, searches name, slug and owner, and is admin only", async () => {
      await makeGame("zoo", "ann@x.test", file(1), file(2));
      await makeGame("farm", "bob@x.test", file(3), file(4));
      const slugs = async (q: string): Promise<string[]> =>
        (
          await request(
            "GET",
            `/api/admin/games?q=${encodeURIComponent(q)}`,
            admin,
          )
        ).body.games.map((g: { slug: string }) => g.slug);
      assert.deepEqual((await slugs("")).sort(), ["farm", "petdle", "zoo"]);
      assert.deepEqual(await slugs("ZOO"), ["zoo"]);
      assert.deepEqual(await slugs("bob@"), ["farm"]);
      assert.deepEqual(await slugs("Game f"), ["farm"]);
      // LIKE wildcards are literal
      assert.deepEqual(await slugs("%"), []);
      assert.equal((await request("GET", "/api/admin/games", ann)).status, 403);
      assert.equal((await request("GET", "/api/admin/games")).status, 401);
    });
  });

  describe("admin deletes a user", () => {
    it("deletes their games and every upload file, leaving others alone", async () => {
      await makeGame("zoo", "ann@x.test", file(1), file(2));
      await makeGame("farm", "bob@x.test", file(3), file(4));
      // An upload attached to nothing still belongs to ann
      await record(file(5), "ann@x.test");
      const id = await idOf("ann@x.test");
      assert.equal(
        (await request("DELETE", `/api/admin/users/${id}`, admin)).status,
        200,
      );
      assert.equal(await exists("zoo"), false);
      assert.equal(await exists("farm"), true);
      assert.deepEqual((await readdir(dir)).sort(), [file(3), file(4)]);
      assert.equal(
        await count("select 1 from users where email = 'ann@x.test'"),
        0,
      );
    });

    it("refuses self-deletion, non-admins and unknown or malformed ids", async () => {
      const self = await idOf("root@x.test");
      const bobId = await idOf("bob@x.test");
      assert.deepEqual(
        (await request("DELETE", `/api/admin/users/${self}`, admin)).body,
        { error: "self_deletion" },
      );
      for (const [path, who, status] of [
        [`/api/admin/users/${bobId}`, ann, 403],
        [`/api/admin/users/${bobId}`, undefined, 401],
        ["/api/admin/users/999999", admin, 404],
        ["/api/admin/users/abc", admin, 400],
      ] as const) {
        assert.equal((await request("DELETE", path, who)).status, status);
      }
      assert.equal(await count("select 1 from users"), 3);
    });
  });
});
