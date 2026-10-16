import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdtemp, writeFile } from "node:fs/promises";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, beforeEach, describe, it } from "node:test";
import { createApp } from "../../src/server/app.ts";
import { MIGRATIONS_DIR } from "../../src/server/main.ts";
import { migrate } from "../../src/server/migrate.ts";
import { recordUpload } from "../../src/server/upload-store.ts";
import { startDb } from "./postgres.ts";
import type { TestDb } from "./postgres.ts";

const NOW = new Date("2026-10-16T10:00:00Z");

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Body = any;

describe("creating and editing a game", () => {
  let db: TestDb;
  let server: Server;
  let url: string;
  let uploads: string;

  const request = async (
    method: string,
    path: string,
    cookie?: string,
    body?: unknown,
  ): Promise<{ status: number; body: Body }> => {
    const res = await fetch(`${url}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(cookie && { Cookie: cookie }),
      },
      ...(body !== undefined &&
        method !== "GET" && { body: JSON.stringify(body) }),
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
  const create = (cookie: string | undefined, body: unknown) =>
    request("POST", "/api/games", cookie, body);
  const setStatus = (slug: string, status: string, entries = 2) =>
    db.pool.query(
      `with g as (update games set status = $2 where slug = $1 returning id)
       insert into entries (game_id, name) select g.id, 'E' || n from g, generate_series(1, $3) n`,
      [slug, status, entries],
    );
  const statusOf = async (slug: string): Promise<string> =>
    (await db.pool.query("select status from games where slug = $1", [slug]))
      .rows[0].status;
  const upload = async (user: string): Promise<string> => {
    const name = `${Math.random().toString(16).slice(2).padEnd(32, "0")}.webp`;
    await writeFile(join(uploads, name), "x");
    const owner = await db.pool.query("select id from users where email = $1", [
      user,
    ]);
    await recordUpload(db.pool, owner.rows[0].id, `/uploads/${name}`, 1, NOW);
    return `/uploads/${name}`;
  };

  before(async () => {
    db = await startDb();
    await migrate(db.pool, MIGRATIONS_DIR);
    uploads = await mkdtemp(join(tmpdir(), "guessdle-manage-"));
    server = await new Promise<Server>((resolve) => {
      const s = createApp({
        pool: db.pool,
        now: () => NOW,
        testLogin: true,
        uploadsDir: uploads,
        writeLimit: { max: 1000, windowMs: 60_000 },
      }).listen(0, "127.0.0.1", () => resolve(s));
    });
    url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  after(async () => {
    server.close();
    await db.stop();
  });
  beforeEach(async () => {
    await db.pool.query("delete from users");
    await db.pool.query("delete from games where slug <> 'petdle'");
  });

  describe("POST /api/games", () => {
    it("401s an anonymous caller", async () => {
      assert.equal((await create(undefined, { name: "X Game" })).status, 401);
    });

    it("creates a draft owned by the caller, starting today", async () => {
      const ann = await login("ann@example.test");
      const res = await create(ann, { name: "My Cool Game" });
      assert.equal(res.status, 201);
      assert.deepEqual(res.body, { slug: "my-cool-game" });
      const { rows } = await db.pool.query(
        `select status, name, description, cover_url, to_char(start_date, 'YYYY-MM-DD') as start,
           (select email from users where id = owner_id) as owner
         from games where slug = 'my-cool-game'`,
      );
      assert.deepEqual(rows, [
        {
          status: "draft",
          name: "My Cool Game",
          description: "",
          cover_url: "",
          start: "2026-10-16",
          owner: "ann@example.test",
        },
      ]);
    });

    it("suffixes a clash on a generated slug", async () => {
      const ann = await login("ann@example.test");
      await create(ann, { name: "Zoo" });
      assert.deepEqual((await create(ann, { name: "Zoo" })).body, {
        slug: "zoo-2",
      });
      assert.deepEqual((await create(ann, { name: "zoo!" })).body, {
        slug: "zoo-3",
      });
    });

    it("suffixes a generated slug that is a reserved word", async () => {
      const ann = await login("ann@example.test");
      assert.deepEqual((await create(ann, { name: "Admin" })).body, {
        slug: "admin-2",
      });
    });

    it("uses a typed slug and rejects a typed clash", async () => {
      const ann = await login("ann@example.test");
      assert.deepEqual((await create(ann, { name: "A", slug: "mine" })).body, {
        slug: "mine",
      });
      const clash = await create(ann, { name: "B", slug: "mine" });
      assert.equal(clash.status, 409);
      assert.equal(clash.body.error, "slug_taken");
      const petdle = await create(ann, { name: "B", slug: "petdle" });
      assert.equal(petdle.status, 409);
    });

    it("rejects reserved and malformed typed slugs", async () => {
      const ann = await login("ann@example.test");
      const reserved = await create(ann, { name: "B", slug: "admin" });
      assert.deepEqual(
        [reserved.status, reserved.body.error],
        [400, "reserved"],
      );
      for (const slug of ["ab", "Has Space", "x".repeat(41), 5]) {
        const res = await create(ann, { name: "B", slug });
        assert.deepEqual(
          [res.status, res.body.error],
          [400, "invalid"],
          String(slug),
        );
      }
    });

    it("rejects a missing, blank or oversized name", async () => {
      const ann = await login("ann@example.test");
      for (const name of [undefined, "", "   ", 7, "x".repeat(61)]) {
        const res = await create(ann, { name });
        assert.deepEqual(
          [res.status, res.body.error],
          [400, "invalid"],
          String(name),
        );
      }
    });
  });

  describe("details and permissions", () => {
    let ann: string;
    let bob: string;
    let root: string;
    beforeEach(async () => {
      ann = await login("ann@example.test");
      bob = await login("bob@example.test");
      root = await login("root@example.test", true);
      await create(ann, { name: "Ann Game" });
    });
    const details = (cookie?: string, slug = "ann-game") =>
      request("GET", `/api/games/${slug}/details`, cookie);
    const patch = (
      cookie: string | undefined,
      body: unknown,
      slug = "ann-game",
    ) => request("PATCH", `/api/games/${slug}`, cookie, body);

    it("a draft is a 404 for everyone but its owner and admins", async () => {
      assert.equal((await details()).status, 404);
      assert.equal((await details(bob)).status, 404);
      assert.equal((await patch(bob, { name: "Hi" })).status, 404);
      const owner = await details(ann);
      assert.equal(owner.status, 200);
      assert.equal(owner.body.status, "draft");
      assert.equal(owner.body.entryCount, 0);
      assert.equal((await details(root)).status, 200);
    });

    it("a playable game is 401 anonymous, 403 for others, 200 for owner and admin", async () => {
      await setStatus("ann-game", "approved");
      assert.equal((await details()).status, 401);
      assert.equal((await details(bob)).status, 403);
      assert.equal((await patch(bob, { name: "Hi" })).status, 403);
      assert.equal((await patch(undefined, { name: "Hi" })).status, 401);
      assert.equal((await details(ann)).status, 200);
      assert.equal((await details(root)).status, 200);
      assert.equal((await patch(root, { name: "By admin" })).status, 200);
    });

    it("an ownerless game is editable by admins only", async () => {
      assert.equal((await details(ann, "petdle")).status, 403);
      assert.equal((await patch(ann, { name: "Hi" }, "petdle")).status, 403);
      assert.equal((await details(root, "petdle")).status, 200);
    });

    it("an unknown slug is a 404", async () => {
      assert.equal((await details(root, "nope")).status, 404);
      assert.equal((await patch(root, { name: "x" }, "nope")).status, 404);
    });

    it("updates name, description and skip period", async () => {
      const res = await patch(ann, {
        name: "Renamed",
        description: "About it",
        skipPeriod: 0,
      });
      assert.equal(res.status, 200);
      const now = await details(ann);
      assert.equal(now.body.name, "Renamed");
      assert.equal(now.body.description, "About it");
      assert.equal(now.body.skipPeriod, 0);
      assert.equal(now.body.slug, "ann-game");
    });

    it("never changes the slug, even for an admin", async () => {
      for (const who of [ann, root]) {
        const res = await patch(who, { slug: "other-slug" });
        assert.deepEqual([res.status, res.body.error], [400, "slug_immutable"]);
      }
      assert.equal(
        (await patch(ann, { slug: "ann-game", name: "Same" })).status,
        200,
      );
    });

    it("rejects bad field values", async () => {
      await setStatus("ann-game", "draft", 3);
      for (const body of [
        { name: "" },
        { name: "x".repeat(61) },
        { description: "x".repeat(501) },
        { description: 3 },
        { skipPeriod: -1 },
        { skipPeriod: 1.5 },
        { skipPeriod: 3 },
        { skipPeriod: "2" },
        { coverUrl: "https://evil.test/x.png" },
        { coverUrl: "/uploads/" + "a".repeat(32) + ".webp" },
      ]) {
        const res = await patch(ann, body);
        assert.deepEqual(
          [res.status, res.body.error],
          [400, "invalid"],
          JSON.stringify(body),
        );
      }
      assert.equal((await patch(ann, { skipPeriod: 2 })).status, 200);
      assert.equal((await patch(ann, { skipPeriod: null })).status, 200);
    });

    it("replacing the cover deletes the old file; clearing it too", async () => {
      const first = await upload("ann@example.test");
      const second = await upload("ann@example.test");
      assert.equal((await patch(ann, { coverUrl: first })).status, 200);
      assert.equal((await patch(ann, { coverUrl: second })).status, 200);
      assert.equal(existsSync(join(uploads, first.slice(9))), false);
      assert.equal(existsSync(join(uploads, second.slice(9))), true);
      assert.equal((await details(ann)).body.cover, second);
      assert.equal((await patch(ann, { coverUrl: "" })).status, 200);
      assert.equal(existsSync(join(uploads, second.slice(9))), false);
    });

    it("keeping the same cover keeps the file", async () => {
      const cover = await upload("ann@example.test");
      await patch(ann, { coverUrl: cover });
      await patch(ann, { coverUrl: cover, name: "Again" });
      assert.equal(existsSync(join(uploads, cover.slice(9))), true);
    });

    it("an edit of text or image sends approved and rejected games to pending", async () => {
      await setStatus("ann-game", "approved");
      await patch(ann, { skipPeriod: 1 });
      assert.equal(await statusOf("ann-game"), "approved");
      await patch(ann, { name: "Ann Game" });
      assert.equal(await statusOf("ann-game"), "approved");
      await patch(ann, { description: "new" });
      assert.equal(await statusOf("ann-game"), "pending");
      await db.pool.query("update games set status = 'rejected'");
      await patch(ann, { coverUrl: await upload("ann@example.test") });
      assert.equal(await statusOf("ann-game"), "pending");
    });

    it("an edit of a draft or pending game keeps its status", async () => {
      await patch(ann, { name: "One" });
      assert.equal(await statusOf("ann-game"), "draft");
      await db.pool.query("update games set status = 'pending'");
      await patch(ann, { name: "Two" });
      assert.equal(await statusOf("ann-game"), "pending");
    });
  });

  describe("GET /api/my-games", () => {
    it("401s an anonymous caller", async () => {
      assert.equal((await request("GET", "/api/my-games")).status, 401);
    });

    it("lists only the caller's games with their status, newest first", async () => {
      const ann = await login("ann@example.test");
      const bob = await login("bob@example.test");
      await create(ann, { name: "First" });
      await create(bob, { name: "Not mine" });
      await create(ann, { name: "Second" });
      await setStatus("first", "rejected");
      await db.pool.query(
        "update games set reject_reason = 'Blurry' where slug = 'first'",
      );
      const res = await request("GET", "/api/my-games", ann);
      assert.equal(res.status, 200);
      assert.deepEqual(
        res.body.map((g: Body) => [g.slug, g.status]),
        [
          ["second", "draft"],
          ["first", "rejected"],
        ],
      );
      assert.equal(res.body[1].entryCount, 2);
    });
  });

  describe("write rate limit", () => {
    it("429s creation past the per-user budget", async () => {
      const limited = await new Promise<Server>((resolve) => {
        const s = createApp({
          pool: db.pool,
          now: () => NOW,
          testLogin: true,
          uploadsDir: uploads,
          writeLimit: { max: 2, windowMs: 60_000 },
        }).listen(0, "127.0.0.1", () => resolve(s));
      });
      try {
        const base = `http://127.0.0.1:${(limited.address() as AddressInfo).port}`;
        const headers = { "Content-Type": "application/json" };
        const res = await fetch(`${base}/api/test/login`, {
          method: "POST",
          headers,
          body: JSON.stringify({ email: "rl@example.test" }),
        });
        const cookie = res.headers.get("set-cookie")!.split(";")[0]!;
        const statuses: number[] = [];
        for (let i = 0; i < 3; i++) {
          const r = await fetch(`${base}/api/games`, {
            method: "POST",
            headers: { ...headers, Cookie: cookie },
            body: JSON.stringify({ name: `Limited ${i}` }),
          });
          statuses.push(r.status);
        }
        assert.deepEqual(statuses, [201, 201, 429]);
      } finally {
        limited.close();
      }
    });
  });
});
