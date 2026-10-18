import assert from "node:assert/strict";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";
import { createApp } from "../../src/server/app.ts";
import { MIGRATIONS_DIR } from "../../src/server/main.ts";
import { migrate } from "../../src/server/migrate.ts";
import { GAME } from "./petdle.ts";
import { startDb } from "./postgres.ts";
import type { TestDb } from "./postgres.ts";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Body = any;
interface Reply {
  status: number;
  body: Body;
}

describe("usernames, profiles and playlists", () => {
  let db: TestDb;
  let server: Server;
  let url: string;

  const send = async (
    method: string,
    path: string,
    cookie: string | null,
    body?: unknown,
  ): Promise<Reply> => {
    const res = await fetch(`${url}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(cookie !== null && { Cookie: cookie }),
      },
      ...(body !== undefined && { body: JSON.stringify(body) }),
    });
    return { status: res.status, body: await res.json() };
  };
  const login = async (email: string): Promise<string> => {
    const res = await fetch(`${url}/api/test/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    return res.headers.get("set-cookie")!.split(";")[0]!;
  };
  // A player with a username
  const player = async (username: string): Promise<string> => {
    const cookie = await login(`${username}@x.test`);
    assert.equal(
      (await send("PUT", "/api/me/username", cookie, { username })).status,
      200,
    );
    return cookie;
  };
  const makeGame = async (
    slug: string,
    status: string,
    ownerEmail?: string,
  ): Promise<void> => {
    await db.pool.query(
      `insert into games (slug, name, status, start_date, owner_id)
       values ($1, $1, $2, '2026-10-16', (select id from users where email = $3))`,
      [slug, status, ownerEmail ?? null],
    );
    await db.pool.query(
      "insert into entries (game_id, name) select id, unnest(array['A', 'B']) from games where slug = $1",
      [slug],
    );
  };
  const create = async (
    cookie: string,
    body: Record<string, unknown>,
  ): Promise<number> => {
    const out = await send("POST", "/api/playlists", cookie, body);
    assert.equal(out.status, 201, JSON.stringify(out.body));
    return out.body.id as number;
  };
  const slugsOf = async (id: number, cookie: string | null) =>
    (await send("GET", `/api/playlists/${id}`, cookie)).body.games.map(
      (g: Body) => g.slug,
    );

  beforeAll(async () => {
    db = await startDb();
    await migrate(db.pool, MIGRATIONS_DIR);
    server = await new Promise<Server>((resolve) => {
      const s = createApp({
        pool: db.pool,
        now: () => new Date("2026-10-16T10:00:00Z"),
        testLogin: true,
        writeLimit: { max: 1000, windowMs: 60_000 },
      }).listen(0, "127.0.0.1", () => resolve(s));
    });
    url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(async () => {
    server.close();
    await db.stop();
  });
  beforeEach(async () => {
    await db.pool.query("delete from users");
    await db.pool.query("delete from games where slug <> $1", [GAME]);
  });

  it("picks a username once: lowercased, unique, and sent with /api/me", async () => {
    const ann = await login("ann@x.test");
    assert.equal((await send("GET", "/api/me", ann)).body.user.username, null);
    for (const bad of ["ab", "has space", "a".repeat(21), "dash-ed", 7]) {
      const out = await send("PUT", "/api/me/username", ann, {
        username: bad,
      });
      assert.equal(out.status, 400, String(bad));
      assert.equal(out.body.error, "invalid_username");
    }
    const out = await send("PUT", "/api/me/username", ann, {
      username: " Ann_1 ",
    });
    assert.deepEqual(out, { status: 200, body: { username: "ann_1" } });
    assert.equal(
      (await send("GET", "/api/me", ann)).body.user.username,
      "ann_1",
    );
    assert.equal(
      (await send("PUT", "/api/me/username", ann, { username: "other" })).body
        .error,
      "username_set",
    );
    const bob = await login("bob@x.test");
    const taken = await send("PUT", "/api/me/username", bob, {
      username: "ANN_1",
    });
    assert.equal(taken.status, 409);
    assert.equal(taken.body.error, "username_taken");
    assert.equal(
      (await send("PUT", "/api/me/username", null, { username: "zed" })).status,
      401,
    );
  });

  it("needs a username before a playlist, and refuses a game the gallery hides", async () => {
    const ann = await login("ann@x.test");
    const out = await send("POST", "/api/playlists", ann, { name: "Mine" });
    assert.equal(out.status, 409);
    assert.equal(out.body.error, "username_required");
    await send("PUT", "/api/me/username", ann, { username: "ann" });
    await makeGame("draft-game", "draft");
    const hidden = await send("POST", "/api/playlists", ann, {
      name: "Mine",
      game: "draft-game",
    });
    assert.equal(hidden.body.error, "game_not_listed");
    assert.equal(
      (await send("POST", "/api/playlists", ann, { name: "  " })).status,
      400,
    );
    assert.equal(
      (await send("POST", "/api/playlists", null, { name: "x" })).status,
      401,
    );
  });

  it("shows public playlists to everyone and private ones only to their owner", async () => {
    const ann = await player("ann");
    const bob = await player("bob");
    const open = await create(ann, {
      name: "Open",
      public: true,
      game: GAME,
    });
    const secret = await create(ann, { name: "Secret" });

    const mine = await send("GET", "/api/users/ann", ann);
    assert.equal(mine.body.own, true);
    assert.deepEqual(
      mine.body.playlists.map((p: Body) => [p.name, p.public, p.gameCount]),
      [
        ["Secret", false, 0],
        ["Open", true, 1],
      ],
    );
    for (const viewer of [bob, null]) {
      const theirs = await send("GET", "/api/users/ann", viewer);
      assert.equal(theirs.body.own, false);
      assert.deepEqual(
        theirs.body.playlists.map((p: Body) => p.name),
        ["Open"],
      );
      assert.equal(
        (await send("GET", `/api/playlists/${secret}`, viewer)).status,
        404,
      );
    }
    const shown = await send("GET", `/api/playlists/${open}`, null);
    assert.equal(shown.status, 200);
    assert.equal(shown.body.owner, "ann");
    assert.equal(shown.body.own, false);
    assert.deepEqual(
      shown.body.games.map((g: Body) => g.slug),
      [GAME],
    );
    assert.equal((await send("GET", "/api/users/nobody", null)).status, 404);
    assert.equal((await send("GET", "/api/playlists/abc", null)).status, 404);
  });

  it("lists the player's approved games on their profile", async () => {
    await player("ann");
    await makeGame("anns-game", "approved", "ann@x.test");
    await makeGame("anns-draft", "draft", "ann@x.test");
    const profile = await send("GET", "/api/users/ann", null);
    assert.deepEqual(
      profile.body.games.map((g: Body) => g.slug),
      ["anns-game"],
    );
  });

  it("saves and unsaves a game from the Save menu", async () => {
    const ann = await player("ann");
    const id = await create(ann, { name: "Daily" });
    const menu = async () =>
      (await send("GET", `/api/my-playlists?game=${GAME}`, ann)).body;
    assert.deepEqual((await menu()).playlists[0].saved, false);
    assert.equal((await menu()).username, "ann");
    const path = `/api/playlists/${id}/games/${GAME}`;
    assert.equal((await send("PUT", path, ann)).status, 200);
    // Saving twice keeps one copy
    assert.equal((await send("PUT", path, ann)).status, 200);
    assert.equal((await menu()).playlists[0].saved, true);
    assert.deepEqual(await slugsOf(id, ann), [GAME]);
    assert.equal((await send("DELETE", path, ann)).status, 200);
    assert.equal((await menu()).playlists[0].saved, false);
    assert.equal(
      (await send("GET", `/api/my-playlists?game=${GAME}`, null)).status,
      401,
    );
  });

  it("lets only the owner change, reorder or delete a playlist", async () => {
    const ann = await player("ann");
    const bob = await player("bob");
    await makeGame("second", "approved");
    await makeGame("third", "approved");
    const open = await create(ann, { name: "Open", public: true });
    const secret = await create(ann, { name: "Secret" });

    const edit = await send("PATCH", `/api/playlists/${open}`, ann, {
      name: "Renamed",
      description: "Mine",
      public: false,
      games: ["third", "nope", GAME, "third", "second"],
    });
    assert.equal(edit.status, 200);
    const after = (await send("GET", `/api/playlists/${open}`, ann)).body;
    assert.deepEqual(
      [after.name, after.description, after.public],
      ["Renamed", "Mine", false],
    );
    // Unknown slugs drop out, repeats keep their first place
    assert.deepEqual(await slugsOf(open, ann), ["third", GAME, "second"]);

    await send("PATCH", `/api/playlists/${open}`, ann, { public: true });
    assert.equal(
      (await send("PATCH", `/api/playlists/${open}`, bob, { name: "Mine" }))
        .status,
      403,
    );
    assert.equal(
      (await send("PUT", `/api/playlists/${open}/games/second`, bob)).status,
      403,
    );
    assert.equal(
      (await send("DELETE", `/api/playlists/${secret}`, bob)).status,
      404,
    );
    assert.equal(
      (await send("PATCH", `/api/playlists/${open}`, ann, { public: "yes" }))
        .status,
      400,
    );
    assert.equal(
      (await send("DELETE", `/api/playlists/${open}`, ann)).status,
      200,
    );
    assert.equal(
      (await send("GET", `/api/playlists/${open}`, ann)).status,
      404,
    );
  });

  it("hides a game that leaves the gallery and brings it back when it returns", async () => {
    const ann = await player("ann");
    await makeGame("second", "approved");
    const id = await create(ann, { name: "Mine", public: true, game: GAME });
    await send("PUT", `/api/playlists/${id}/games/second`, ann);
    await db.pool.query(
      "update games set status = 'pending' where slug = 'second'",
    );
    assert.deepEqual(await slugsOf(id, null), [GAME]);
    assert.equal(
      (await send("GET", "/api/users/ann", null)).body.playlists[0].gameCount,
      1,
    );
    await db.pool.query(
      "update games set status = 'approved' where slug = 'second'",
    );
    assert.deepEqual(await slugsOf(id, null), [GAME, "second"]);
    // Deleting the game takes it out for good
    await db.pool.query("delete from games where slug = 'second'");
    assert.deepEqual(await slugsOf(id, null), [GAME]);
  });

  it("deletes a player's playlists with their account", async () => {
    const ann = await player("ann");
    await create(ann, { name: "Mine" });
    await db.pool.query("delete from users where email = 'ann@x.test'");
    assert.equal((await db.pool.query("select 1 from playlists")).rowCount, 0);
  });
});
