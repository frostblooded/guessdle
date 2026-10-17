import assert from "node:assert/strict";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { after, afterEach, before, beforeEach, describe, it } from "node:test";
import { createApp } from "../../src/server/app.ts";
import { MIGRATIONS_DIR } from "../../src/server/main.ts";
import { migrate } from "../../src/server/migrate.ts";
import { GAME, PET_IDS } from "./petdle.ts";
import { startDb } from "./postgres.ts";
import type { TestDb } from "./postgres.ts";

const NOW = new Date("2026-10-16T10:00:00Z");
const G = `/api/games/${GAME}`;
const SLUG = "other";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Body = any;

describe("games in the database", () => {
  let db: TestDb;
  let server: Server;
  let url: string;

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
  const makeGame = async (
    status: string,
    entries: number,
  ): Promise<number[]> => {
    await db.pool.query(
      "insert into games (slug, name, status, start_date) values ($1, 'Other', $2, '2026-10-16')",
      [SLUG, status],
    );
    for (let i = 0; i < entries; i++) {
      await db.pool.query(
        "insert into entries (game_id, name) select id, $1 from games where slug = $2",
        [`E${i}`, SLUG],
      );
    }
    return (
      await db.pool.query(
        "select id::int from entries where game_id = (select id from games where slug = $1) order by id",
        [SLUG],
      )
    ).rows.map((r) => r.id as number);
  };
  const guessRows = async (): Promise<number> =>
    (await db.pool.query("select 1 from user_guesses")).rowCount ?? 0;

  before(async () => {
    db = await startDb();
    await migrate(db.pool, MIGRATIONS_DIR);
    server = await new Promise<Server>((resolve) => {
      const s = createApp({
        pool: db.pool,
        now: () => NOW,
        testLogin: true,
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
  });
  afterEach(async () => {
    await db.pool.query("delete from games where slug = $1", [SLUG]);
  });

  describe("the Petdle migration", () => {
    it("creates Petdle as an ownerless approved game with two List attributes", async () => {
      const { rows } = await db.pool.query(
        `select name, status, owner_id, to_char(start_date, 'YYYY-MM-DD') as start
         from games where slug = 'petdle'`,
      );
      assert.deepEqual(rows, [
        {
          name: "Petdle",
          status: "approved",
          owner_id: null,
          start: "2025-08-15",
        },
      ]);
      const attrs = await db.pool.query(
        "select name, type from attributes order by position",
      );
      assert.deepEqual(attrs.rows, [
        { name: "Colors", type: "list" },
        { name: "Owners", type: "list" },
      ]);
    });

    it("tells the page whether the viewer may edit: admins yes, others and anonymous no", async () => {
      const admin = await login("root@example.com", true);
      const user = await login("ann@example.com");
      assert.equal((await request("GET", G)).body.canEdit, false);
      assert.equal((await request("GET", G, user)).body.canEdit, false);
      assert.equal((await request("GET", G, admin)).body.canEdit, true);
    });

    it("keeps every pet's values in order", async () => {
      const { rows } = await db.pool.query(
        `select a.name as attr, array_agg(v.value order by v.position) as vals
         from entry_values v
         join attributes a on a.id = v.attribute_id
         join entries e on e.id = v.entry_id
         where e.name = 'Kiara' group by a.name order by a.name`,
      );
      assert.deepEqual(rows, [
        { attr: "Colors", vals: ["Black", "Orange", "White"] },
        { attr: "Owners", vals: ["Antonio", "Tanya"] },
      ]);
    });
  });

  describe("GET /api/games (the gallery)", () => {
    const addGame = async (
      slug: string,
      status: string,
      entries: number,
      created: string,
    ): Promise<void> => {
      await db.pool.query(
        "insert into games (slug, name, description, cover_url, status, start_date, created_at) values ($1, $1, 'About ' || $1, '/uploads/c.webp', $2, '2026-10-16', $3)",
        [slug, status, created],
      );
      for (let i = 0; i < entries; i++) {
        await db.pool.query(
          "insert into entries (game_id, name) select id, 'E' from games where slug = $1",
          [slug],
        );
      }
    };
    afterEach(async () => {
      await db.pool.query("delete from games where slug like 'gal-%'");
    });

    it("lists Petdle first, then approved playable games newest first, with an entry count", async () => {
      await addGame("gal-old", "approved", 2, "2026-01-01");
      await addGame("gal-new", "approved", 3, "2026-06-01");
      const { status, body } = await request("GET", "/api/games");
      assert.equal(status, 200);
      assert.deepEqual(
        body.map((g: Body) => g.slug),
        [GAME, "gal-new", "gal-old"],
      );
      assert.deepEqual(body[1], {
        slug: "gal-new",
        name: "gal-new",
        description: "About gal-new",
        cover: "/uploads/c.webp",
        photos: [],
        entryCount: 3,
      });
      assert.equal(body[0].entryCount, PET_IDS.length);
    });

    it("gives a game without a cover the photos of its active entries for a banner collage", async () => {
      await addGame("gal-bare", "approved", 0, "2026-01-01");
      await db.pool.query(
        "update games set cover_url = '' where slug = 'gal-bare'",
      );
      const add = (name: string, photo: string): Promise<unknown> =>
        db.pool.query(
          "insert into entries (game_id, name, photo_url) select id, $1, $2 from games where slug = 'gal-bare'",
          [name, photo],
        );
      for (let i = 0; i < 10; i++) {
        await add(`P${i}`, `/uploads/p${i}.webp`);
      }
      await add("No photo", "");
      await db.pool.query(
        "update entries set deleted_at = now() where name = 'P0' and game_id = (select id from games where slug = 'gal-bare')",
      );
      const { body } = await request("GET", "/api/games");
      const bare = body.find((g: Body) => g.slug === "gal-bare");
      // P0 is deleted; the blank photo is skipped; at most 8, by entry id
      assert.deepEqual(
        bare.photos,
        [1, 2, 3, 4, 5, 6, 7, 8].map((i) => `/uploads/p${i}.webp`),
      );
    });

    it("gives a game without a cover or entry photos an empty collage", async () => {
      await addGame("gal-plain", "approved", 3, "2026-01-01");
      await db.pool.query(
        "update games set cover_url = '' where slug = 'gal-plain'",
      );
      const { body } = await request("GET", "/api/games");
      const plain = body.find((g: Body) => g.slug === "gal-plain");
      assert.equal(plain.cover, "");
      assert.deepEqual(plain.photos, []);
    });

    it("hides drafts, pending, rejected, and games under 2 active entries", async () => {
      await addGame("gal-draft", "draft", 3, "2026-01-01");
      await addGame("gal-pending", "pending", 3, "2026-01-01");
      await addGame("gal-rejected", "rejected", 3, "2026-01-01");
      await addGame("gal-small", "approved", 1, "2026-01-01");
      await addGame("gal-gone", "approved", 3, "2026-01-01");
      await db.pool.query(
        "update entries set deleted_at = now() where id in (select id from entries where game_id = (select id from games where slug = 'gal-gone') limit 2)",
      );
      const { body } = await request("GET", "/api/games");
      assert.deepEqual(
        body.map((g: Body) => g.slug),
        [GAME],
      );
    });
  });

  describe("GET /api/games/:slug", () => {
    it("describes the game: attributes in order and the active entries", async () => {
      const { status, body } = await request("GET", G);
      assert.equal(status, 200);
      assert.equal(body.slug, GAME);
      assert.equal(body.name, "Petdle");
      assert.deepEqual(body.attributes, [
        { name: "Colors", type: "list" },
        { name: "Owners", type: "list" },
      ]);
      assert.deepEqual(
        body.entries.map((e: Body) => e.id),
        PET_IDS,
      );
      assert.deepEqual(body.entries[0], {
        id: 1,
        name: "Ati",
        photo: "/photos/ati.jpg",
      });
    });

    it("leaves out soft-deleted entries", async () => {
      await db.pool.query("update entries set deleted_at = now() where id = 1");
      try {
        const { body } = await request("GET", G);
        assert.equal(body.entries.length, 18);
      } finally {
        await db.pool.query("update entries set deleted_at = null");
      }
    });
  });

  describe("visibility", () => {
    it("answers 404 for an unknown slug on every play route", async () => {
      const cookie = await login("a@x.test");
      for (const [method, path] of [
        ["GET", "/api/games/nope"],
        ["POST", "/api/games/nope/grade"],
        ["POST", "/api/games/nope/give-up"],
        ["GET", "/api/games/nope/state"],
        ["POST", "/api/games/nope/state/guess"],
      ]) {
        const res = await request(method!, path!, cookie, {});
        assert.deepEqual([res.status, res.body.error], [404, "not_found"]);
      }
    });

    it("hides a draft and a game with fewer than 2 entries from players, not from an admin", async () => {
      const admin = await login("admin@x.test", true);
      const player = await login("a@x.test");
      for (const [status, entries] of [
        ["draft", 3],
        ["approved", 1],
        ["pending", 0],
      ] as const) {
        await makeGame(status, entries);
        const path = `/api/games/${SLUG}`;
        assert.equal((await request("GET", path)).status, 404, status);
        assert.equal((await request("GET", path, player)).status, 404, status);
        assert.equal((await request("GET", path, admin)).status, 200, status);
        await db.pool.query("delete from games where slug = $1", [SLUG]);
      }
    });

    it("hides a draft from its owner's play too only when unplayable: the owner can open it", async () => {
      const owner = await login("owner@x.test");
      await makeGame("draft", 2);
      await db.pool.query(
        "update games set owner_id = (select id from users where email = 'owner@x.test') where slug = $1",
        [SLUG],
      );
      assert.equal((await request("GET", `/api/games/${SLUG}`)).status, 404);
      assert.equal(
        (await request("GET", `/api/games/${SLUG}`, owner)).status,
        200,
      );
    });

    it("plays a pending, rejected or approved game with 2 entries by link", async () => {
      for (const status of ["pending", "rejected", "approved"]) {
        await makeGame(status, 2);
        assert.equal(
          (await request("GET", `/api/games/${SLUG}`)).status,
          200,
          status,
        );
        await db.pool.query("delete from games where slug = $1", [SLUG]);
      }
    });
  });

  describe("a second game", () => {
    it("has its own Day 0, answers and state, apart from Petdle", async () => {
      const ids = await makeGame("approved", 3);
      const cookie = await login("a@x.test");
      const mine = `/api/games/${SLUG}`;

      const graded = await request("POST", `${mine}/grade`, undefined, {
        ids: [],
      });
      assert.equal(graded.body.day, 0);

      // A Petdle entry is not a guess here, and vice versa
      const foreign = await request("POST", `${mine}/state/guess`, cookie, {
        id: PET_IDS[0],
      });
      assert.equal(foreign.body.error, "invalid");
      const crossed = await request("POST", `${G}/state/guess`, cookie, {
        id: ids[0],
      });
      assert.equal(crossed.body.error, "invalid");

      await request("POST", `${G}/state/guess`, cookie, { id: PET_IDS[0] });
      await request("POST", `${mine}/state/guess`, cookie, { id: ids[0] });
      assert.deepEqual((await request("GET", `${G}/state`, cookie)).body.ids, [
        PET_IDS[0],
      ]);
      assert.deepEqual(
        (await request("GET", `${mine}/state`, cookie)).body.ids,
        [ids[0]],
      );

      // Resetting one game leaves the other
      await request("POST", `${mine}/state/reset`, cookie, {});
      assert.deepEqual((await request("GET", `${G}/state`, cookie)).body.ids, [
        PET_IDS[0],
      ]);
      assert.equal(await guessRows(), 1);
    });

    it("stores one answer per game per day", async () => {
      await makeGame("approved", 3);
      await request("POST", `/api/games/${SLUG}/grade`, undefined, { ids: [] });
      await request("POST", `${G}/grade`, undefined, { ids: [] });
      const { rows } = await db.pool.query(
        "select game_id from daily_answers where day = '2026-10-16' order by game_id",
      );
      assert.equal(rows.length, 2);
    });

    it("deleting the game removes its answers and guesses but not its entries' neighbours", async () => {
      const ids = await makeGame("approved", 2);
      const cookie = await login("a@x.test");
      await request("POST", `/api/games/${SLUG}/state/guess`, cookie, {
        id: ids[0],
      });
      await db.pool.query("delete from games where slug = $1", [SLUG]);
      assert.equal(await guessRows(), 0);
      assert.equal(
        (
          await db.pool.query(
            "select 1 from daily_answers where day = '2026-10-16'",
          )
        ).rowCount,
        1,
      );
    });
  });
});
