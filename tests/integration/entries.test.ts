import assert from "node:assert/strict";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";
import { createApp } from "../../src/server/app.ts";
import { MIGRATIONS_DIR } from "../../src/server/main.ts";
import { migrate } from "../../src/server/migrate.ts";
import { startDb } from "./postgres.ts";
import type { TestDb } from "./postgres.ts";

const NOW = new Date("2026-10-16T10:00:00Z");

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Body = any;

describe("game entries", () => {
  let db: TestDb;
  let server: Server;
  let url: string;
  let ann: string;
  let colorId: number;
  let originId: number;

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
  const E = "/api/games/ann-game/entries";
  const add = (body: unknown, cookie: string | undefined = ann) =>
    request("POST", E, cookie, body);
  const one = async (name: string): Promise<Body> =>
    (await request("GET", E, ann)).body.find((e: Body) => e.name === name);
  const status = async (): Promise<string> =>
    (await db.pool.query("select status from games where slug = 'ann-game'"))
      .rows[0].status;

  beforeAll(async () => {
    db = await startDb();
    await migrate(db.pool, MIGRATIONS_DIR);
    server = await new Promise<Server>((resolve) => {
      const s = createApp({
        pool: db.pool,
        now: () => NOW,
        random: () => 0,
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
    await db.pool.query("delete from games where slug <> 'petdle'");
    ann = await login("ann@example.test");
    await request("POST", "/api/games", ann, { name: "Ann Game" });
    const A = "/api/games/ann-game/attributes";
    await request("POST", A, ann, { name: "Color", type: "list" });
    const attrs = (
      await request("POST", A, ann, { name: "Origin", type: "text" })
    ).body;
    [colorId, originId] = attrs.map((a: Body) => a.id);
  });

  it("is owner/admin only: 404 while hidden, then 401 and 403", async () => {
    const bob = await login("bob@example.test");
    assert.equal(
      (await request("POST", E, undefined, { name: "X" })).status,
      404,
    );
    assert.equal((await add({ name: "X" }, bob)).status, 404);
    await add({ name: "A" });
    await add({ name: "B" });
    await db.pool.query("update games set status = 'approved'");
    assert.equal(
      (await request("POST", E, undefined, { name: "X" })).status,
      401,
    );
    assert.equal((await add({ name: "X" }, bob)).status, 403);
    assert.equal((await request("GET", E, bob)).status, 403);
    assert.equal((await request("DELETE", `${E}/1`, bob)).status, 403);
  });

  it("adds and edits entries with text and list values", async () => {
    const res = await add({
      name: " Rex ",
      values: { [colorId]: ["Red", " ", "Blue"], [originId]: "Spain" },
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.length, 1);
    const rex = await one("Rex");
    assert.deepEqual(rex.values, {
      [colorId]: ["Red", "Blue"],
      [originId]: ["Spain"],
    });
    // A patch touches only what it names; an empty list clears the value
    const patched = await request("PATCH", `${E}/${rex.id}`, ann, {
      values: { [colorId]: [] },
    });
    assert.equal(patched.status, 200);
    assert.deepEqual((await one("Rex")).values, { [originId]: ["Spain"] });
    await request("PATCH", `${E}/${rex.id}`, ann, { name: "Rexy" });
    assert.deepEqual((await one("Rexy")).values, { [originId]: ["Spain"] });
  });

  it("rejects bad input and name clashes", async () => {
    await add({ name: "Rex" });
    for (const body of [
      {},
      { name: "" },
      { name: "x".repeat(61) },
      { name: "A", photo: 3 },
      { name: "A", photo: "/uploads/" + "0".repeat(32) + ".webp" },
      { name: "A", values: { [colorId]: ["x".repeat(201)] } },
      { name: "A", values: { [colorId]: Array(21).fill("x") } },
      { name: "A", values: { [colorId]: [1] } },
      { name: "A", values: { [originId]: ["a", "b"] } },
      { name: "A", values: { 999999: ["a"] } },
      { name: "A", values: "nope" },
    ]) {
      assert.equal((await add(body)).status, 400, JSON.stringify(body));
    }
    const clash = await add({ name: "rEX" });
    assert.equal(clash.status, 409);
    assert.equal(clash.body.error, "entry_exists");
    assert.equal(
      (await request("PATCH", `${E}/99999999`, ann, { name: "Z" })).status,
      404,
    );
    assert.equal((await request("PATCH", `${E}/abc`, ann, {})).status, 404);
  });

  it("an edit sends an approved game back to pending, a draft stays draft", async () => {
    await add({ name: "Rex" });
    assert.equal(await status(), "draft");
    await db.pool.query("update games set status = 'approved'");
    await add({ name: "Fido" });
    assert.equal(await status(), "pending");
    await db.pool.query("update games set status = 'rejected'");
    await request("PATCH", `${E}/${(await one("Rex")).id}`, ann, {
      name: "Rexo",
    });
    assert.equal(await status(), "pending");
  });

  it("replacing or removing a photo deletes the old upload", async () => {
    const name = (n: number): string => n.toString(16).padStart(32, "0");
    const uid = (await db.pool.query("select id from users limit 1")).rows[0]
      .id;
    for (const n of [1, 2]) {
      await db.pool.query(
        "insert into uploads (name, user_id, bytes, created_at) values ($1, $2, 10, now())",
        [`${name(n)}.webp`, uid],
      );
    }
    const first = `/uploads/${name(1)}.webp`;
    const second = `/uploads/${name(2)}.webp`;
    await add({ name: "Rex", photo: first });
    const id = (await one("Rex")).id;
    const left = async (): Promise<string[]> =>
      (await db.pool.query("select name from uploads order by name")).rows.map(
        (r) => r.name,
      );
    await request("PATCH", `${E}/${id}`, ann, { photo: second });
    assert.deepEqual(await left(), [`${name(2)}.webp`]);
    assert.equal((await one("Rex")).photo, second);
    await request("PATCH", `${E}/${id}`, ann, { photo: "" });
    assert.deepEqual(await left(), []);
  });

  it("soft delete hides the entry, keeps history, clears future overrides", async () => {
    for (const n of ["A", "B", "C"]) {
      await add({ name: n });
    }
    const a = (await one("A")).id;
    const b = (await one("B")).id;
    const game = (
      await db.pool.query("select id from games where slug = 'ann-game'")
    ).rows[0].id;
    await db.pool.query(
      `insert into daily_answers (game_id, day, entry_id, source) values
         ($1, '2026-10-15', $2, 'generated'),
         ($1, '2026-10-17', $2, 'override'),
         ($1, '2026-10-18', $3, 'generated')`,
      [game, a, b],
    );
    const res = await request("DELETE", `${E}/${a}`, ann);
    assert.equal(res.status, 200);
    assert.deepEqual(
      res.body.map((e: Body) => e.name),
      ["B", "C"],
    );
    const rows = (
      await db.pool.query(
        `select to_char(day, 'YYYY-MM-DD') as day, entry_id::int, source
         from daily_answers where game_id = $1 order by day`,
        [game],
      )
    ).rows;
    // Past history still points at the deleted entry; the override is gone
    assert.deepEqual(rows[0], {
      day: "2026-10-15",
      entry_id: a,
      source: "generated",
    });
    assert.equal(rows[1].source, "generated");
    assert.notEqual(rows[1].entry_id, a);
    assert.notEqual(rows[2].entry_id, a);
    // The row stays so history resolves
    assert.equal(
      (await db.pool.query("select 1 from entries where id = $1", [a]))
        .rowCount,
      1,
    );
    assert.equal((await request("DELETE", `${E}/${a}`, ann)).status, 404);
  });

  it("soft delete keeps today's answer (override or generated) as players saw it", async () => {
    for (const n of ["A", "B", "C"]) {
      await add({ name: n });
    }
    const a = (await one("A")).id;
    const game = (
      await db.pool.query("select id from games where slug = 'ann-game'")
    ).rows[0].id;
    await db.pool.query(
      `insert into daily_answers (game_id, day, entry_id, source) values
         ($1, '2026-10-16', $2, 'override'),
         ($1, '2026-10-17', $2, 'generated')`,
      [game, a],
    );
    await request("DELETE", `${E}/${a}`, ann);
    const rows = (
      await db.pool.query(
        `select to_char(day, 'YYYY-MM-DD') as day, entry_id::int, source
         from daily_answers where game_id = $1 order by day`,
        [game],
      )
    ).rows;
    assert.deepEqual(rows[0], {
      day: "2026-10-16",
      entry_id: a,
      source: "override",
    });
    assert.notEqual(rows[1]!.entry_id, a);
  });

  it("dropping below two active entries makes the game a 404 for players", async () => {
    await add({ name: "A" });
    await add({ name: "B" });
    await db.pool.query("update games set status = 'approved'");
    assert.equal((await request("GET", "/api/games/ann-game")).status, 200);
    await request("DELETE", `${E}/${(await one("A")).id}`, ann);
    assert.equal((await request("GET", "/api/games/ann-game")).status, 404);
    assert.equal(
      (await request("GET", "/api/games/ann-game", ann)).status,
      200,
    );
  });

  it("removing an attribute drops its values from the entry list", async () => {
    await add({ name: "A", values: { [originId]: "Spain" } });
    await request("DELETE", `/api/games/ann-game/attributes/${originId}`, ann);
    assert.deepEqual((await one("A")).values, {});
  });
});
