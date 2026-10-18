import assert from "node:assert/strict";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";
import { createApp } from "../../src/server/app.ts";
import { MIGRATIONS_DIR } from "../../src/server/main.ts";
import { migrate } from "../../src/server/migrate.ts";
import { GAME, PET_IDS, pid } from "./petdle.ts";
import { startDb } from "./postgres.ts";
import type { TestDb } from "./postgres.ts";

// 2026-10-16 is Day Number 427; the backfill stores "bela" for it
const NOW = new Date("2026-10-16T10:00:00Z");
const ANSWER = pid("bela");
const OTHER = PET_IDS.find((id) => id !== ANSWER)!;
const G = `/api/games/${GAME}`;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Body = any;
interface Reply {
  status: number;
  body: Body;
}

describe("admin bans", () => {
  let db: TestDb;
  let server: Server;
  let url: string;
  let uploadsDir: string;

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
    const text = await res.text();
    return {
      status: res.status,
      body: /^[[{]/.test(text) ? JSON.parse(text) : text,
    };
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
    (await db.pool.query("select id::int from users where email = $1", [email]))
      .rows[0].id as number;
  const ban = (
    cookie: string | null,
    id: number,
    reason: unknown,
  ): Promise<Reply> =>
    send("PUT", `/api/admin/users/${id}/ban`, cookie, { reason });
  const unban = (cookie: string | null, id: number): Promise<Reply> =>
    send("DELETE", `/api/admin/users/${id}/ban`, cookie, {});
  const gallery = async (): Promise<string[]> =>
    ((await send("GET", "/api/games", null)).body as { slug: string }[]).map(
      (card) => card.slug,
    );

  let boss: string;
  let ann: string;
  let sam: string;
  let annId: number;

  beforeAll(async () => {
    db = await startDb();
    await migrate(db.pool, MIGRATIONS_DIR);
    uploadsDir = await mkdtemp(join(tmpdir(), "bans-"));
    server = await new Promise<Server>((resolve) => {
      const s = createApp({
        pool: db.pool,
        now: () => NOW,
        testLogin: true,
        uploadsDir,
      }).listen(0, "127.0.0.1", () => resolve(s));
    });
    url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(async () => {
    server.close();
    await db.stop();
    await rm(uploadsDir, { recursive: true, force: true });
  });
  beforeEach(async () => {
    // Petdle survives the user wipe (owner rows cascade to games)
    await db.pool.query("update games set owner_id = null");
    await db.pool.query("delete from game_results");
    await db.pool.query("delete from users");
    boss = await login("boss@x.test", true);
    ann = await login("ann@x.test");
    sam = await login("sam@x.test");
    annId = await idOf("ann@x.test");
    // Ann owns Petdle, an approved playable game
    await db.pool.query("update games set owner_id = $1 where slug = $2", [
      annId,
      GAME,
    ]);
  });

  it("is admin only, needs a reason, and spares yourself and admins", async () => {
    assert.equal((await ban(null, annId, "spam")).status, 401);
    assert.equal((await ban(sam, annId, "spam")).status, 403);
    for (const reason of ["", "   ", 5, "x".repeat(501)]) {
      assert.equal(
        (await ban(boss, annId, reason)).status,
        400,
        String(reason),
      );
    }
    const bossId = await idOf("boss@x.test");
    assert.deepEqual((await ban(boss, bossId, "oops")).body, {
      error: "self_ban",
    });
    await login("eve@x.test", true);
    assert.deepEqual((await ban(boss, await idOf("eve@x.test"), "no")).body, {
      error: "admin_ban",
    });
    assert.equal((await ban(boss, 999999, "gone")).status, 404);
    assert.equal(
      (await send("GET", "/api/me", ann)).body.user.banned,
      undefined,
    );
  });

  it("hides the banned player's games from everyone but them and admins", async () => {
    assert.ok((await gallery()).includes(GAME));
    assert.equal((await ban(boss, annId, "  Rude names  ")).status, 200);

    assert.ok(!(await gallery()).includes(GAME));
    assert.equal((await send("GET", G, null)).status, 404);
    assert.equal((await send("GET", G, sam)).status, 404);
    assert.equal((await send("GET", `/g/${GAME}`, null)).status, 404);
    assert.equal(
      (await send("POST", `${G}/grade`, null, { ids: [OTHER] })).status,
      404,
    );

    const own = await send("GET", G, ann);
    assert.equal(own.status, 200);
    assert.equal(own.body.canEdit, false);
    const admin = await send("GET", G, boss);
    assert.equal(admin.status, 200);
    assert.equal(admin.body.canEdit, true);
  });

  it("lets the banned player play but not create or change games", async () => {
    await ban(boss, annId, "Rude names");
    const me = (await send("GET", "/api/me", ann)).body.user;
    assert.equal(me.banned, true);
    assert.equal(me.banReason, "Rude names");

    assert.deepEqual((await send("GET", `${G}/details`, ann)).body, {
      error: "banned",
    });
    assert.equal((await send("GET", `${G}/details`, boss)).status, 200);
    assert.deepEqual(
      (await send("POST", "/api/games", ann, { name: "New one" })).body,
      { error: "banned" },
    );
    const upload = await fetch(`${url}/api/uploads?kind=photo`, {
      method: "POST",
      headers: { "Content-Type": "application/octet-stream", Cookie: ann },
      body: new Uint8Array([1, 2, 3]),
    });
    assert.equal(upload.status, 403);
    assert.deepEqual(await upload.json(), { error: "banned" });

    // Playing still works, on their own game and others'
    await db.pool.query("update games set owner_id = null where slug = $1", [
      GAME,
    ]);
    assert.equal(
      (await send("POST", `${G}/state/guess`, ann, { id: OTHER })).status,
      200,
    );
  });

  it("shows the ban in the Users list and blocks promoting a banned player", async () => {
    await ban(boss, annId, "Rude names");
    const users = (await send("GET", "/api/admin/users", boss)).body.users;
    const row = users.find((u: Body) => u.id === annId);
    assert.equal(row.banned, true);
    assert.equal(row.banReason, "Rude names");
    assert.deepEqual(
      (await send("PUT", `/api/admin/users/${annId}`, boss, { admin: true }))
        .body,
      { error: "promote_banned" },
    );
  });

  it("drops a banned player's wins from other players' stats", async () => {
    await db.pool.query("update games set owner_id = null where slug = $1", [
      GAME,
    ]);
    const gameId = (
      await db.pool.query("select id::int from games where slug = $1", [GAME])
    ).rows[0].id as number;
    await db.pool.query(
      `insert into game_results (game_id, day, player, guesses, seconds)
       values ($1, '2026-10-16', $2, 1, 5)`,
      [gameId, `user:${annId}`],
    );
    const win = (): Promise<Reply> =>
      send("POST", `${G}/result`, null, {
        ids: [OTHER, ANSWER],
        seconds: 30,
        player: "aaaaaaaa-0000-4000-8000-000000000001",
      });
    const first = await win();
    assert.equal(first.body.players, 2, JSON.stringify(first));
    await ban(boss, annId, "Cheating");
    assert.equal((await win()).body.players, 1);
    await unban(boss, annId);
    assert.equal((await win()).body.players, 2);
  });

  it("unban restores everything as it was", async () => {
    await ban(boss, annId, "Rude names");
    assert.equal((await unban(sam, annId)).status, 403);
    assert.equal((await unban(boss, annId)).status, 200);

    assert.ok((await gallery()).includes(GAME));
    assert.equal((await send("GET", G, null)).status, 200);
    assert.equal((await send("GET", G, ann)).body.canEdit, true);
    assert.equal((await send("GET", `${G}/details`, ann)).status, 200);
    const me = (await send("GET", "/api/me", ann)).body.user;
    assert.equal(me.banned, undefined);
    const status = await db.pool.query(
      "select status from games where slug = $1",
      [GAME],
    );
    assert.equal(status.rows[0].status, "approved");
  });
});
