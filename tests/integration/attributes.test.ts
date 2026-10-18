import assert from "node:assert/strict";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";
import { createApp } from "../../src/server/app.ts";
import { MAX_ATTRIBUTES } from "../../src/game/limits.ts";
import { MIGRATIONS_DIR } from "../../src/server/main.ts";
import { migrate } from "../../src/server/migrate.ts";
import { startDb } from "./postgres.ts";
import type { TestDb } from "./postgres.ts";

const NOW = new Date("2026-10-16T10:00:00Z");

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Body = any;

describe("game attributes", () => {
  let db: TestDb;
  let server: Server;
  let url: string;
  let ann: string;

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
  const A = "/api/games/ann-game/attributes";
  const add = (name: string, type = "text", cookie: string | undefined = ann) =>
    request("POST", A, cookie, { name, type });
  const change = (id: number, body: unknown) =>
    request("PATCH", `${A}/${id}`, ann, body);
  const statusOf = async (): Promise<string> =>
    (await db.pool.query("select status from games where slug = 'ann-game'"))
      .rows[0].status;
  const values = async (attr: string): Promise<string[]> =>
    (
      await db.pool.query(
        `select v.value from entry_values v join attributes a on a.id = v.attribute_id
         join games g on g.id = a.game_id
         where g.slug = 'ann-game' and a.name = $1 order by v.entry_id, v.position`,
        [attr],
      )
    ).rows.map((r) => r.value);
  const fill = (attrId: number, entry: string, items: string[]) =>
    db.pool.query(
      `insert into entry_values (entry_id, attribute_id, position, value)
       select e.id, $1, p.n - 1, p.v from entries e join games g on g.id = e.game_id,
         unnest($3::text[]) with ordinality as p (v, n)
       where g.slug = 'ann-game' and e.name = $2`,
      [attrId, entry, items],
    );

  beforeAll(async () => {
    db = await startDb();
    await migrate(db.pool, MIGRATIONS_DIR);
    server = await new Promise<Server>((resolve) => {
      const s = createApp({
        pool: db.pool,
        now: () => NOW,
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
    await db.pool.query(
      `insert into entries (game_id, name) select g.id, 'E' || n
       from games g, generate_series(1, 2) n where g.slug = 'ann-game'`,
    );
  });

  it("is owner/admin only: 404 while hidden, then 401 and 403", async () => {
    const bob = await login("bob@example.test");
    const anon = (): Promise<{ status: number }> =>
      request("POST", A, undefined, { name: "X", type: "text" });
    assert.equal((await anon()).status, 404);
    assert.equal((await add("X", "text", bob)).status, 404);
    await db.pool.query("update games set status = 'approved'");
    assert.equal((await anon()).status, 401);
    assert.equal((await add("X", "text", bob)).status, 403);
    assert.equal((await request("GET", A, bob)).status, 403);
    assert.equal((await request("DELETE", A + "/1", bob)).status, 403);
  });

  it("adds attributes in order; existing entries get no value rows", async () => {
    await add("Color", "list");
    const res = await add("Origin");
    assert.equal(res.status, 200);
    assert.deepEqual(
      res.body.map((a: Body) => [a.name, a.type]),
      [
        ["Color", "list"],
        ["Origin", "text"],
      ],
    );
    assert.deepEqual(await values("Origin"), []);
    // an empty cell loads as "" so grading and the roster never break
    const roster = await request("GET", "/api/games/ann-game", ann);
    assert.equal(roster.body.attributes.length, 2);
  });

  it("rejects bad names, types, duplicates and more than the cap", async () => {
    for (const body of [
      { name: "", type: "text" },
      { name: "  ", type: "text" },
      { name: "x".repeat(41), type: "text" },
      { name: "A", type: "date" },
      { name: "A" },
      { type: "text" },
    ]) {
      assert.equal((await request("POST", A, ann, body)).status, 400);
    }
    await add("Color");
    const dup = await add(" color ");
    assert.equal(dup.status, 409);
    assert.equal(dup.body.error, "attribute_exists");
    for (let i = 1; i < MAX_ATTRIBUTES; i++) {
      assert.equal((await add(`A${i}`)).status, 200);
    }
    assert.equal((await add("One too many")).status, 400);
  });

  it("renames and retypes; bad input 400; unknown or foreign ids 404", async () => {
    const [color] = (await add("Color")).body;
    assert.equal((await change(color.id, { name: "Hue" })).body[0].name, "Hue");
    assert.equal((await change(color.id, { name: "" })).status, 400);
    assert.equal((await change(color.id, { type: "bad" })).status, 400);
    assert.equal((await change(999999, {})).status, 404);
    assert.equal((await request("DELETE", `${A}/nope`, ann)).status, 404);
    const foreign = await db.pool.query(
      "select id from attributes order by id limit 1",
    );
    assert.equal(
      (await request("DELETE", `${A}/${foreign.rows[0].id}`, ann)).status,
      404,
    );
  });

  it("refuses a rename onto another attribute's name", async () => {
    await add("A");
    const [, b] = (await add("B")).body;
    assert.equal((await change(b.id, { name: "a" })).status, 409);
  });

  it("retyping erases the attribute's values; a rename keeps them", async () => {
    const [attr, other] = (await add("Tags")).body.concat(
      (await add("Other")).body.slice(1),
    );
    await fill(attr.id, "E1", ["solo"]);
    await fill(other.id, "E1", ["kept"]);
    await change(attr.id, { name: "Labels" });
    assert.deepEqual(await values("Labels"), ["solo"]);
    await change(attr.id, { type: "number" });
    assert.deepEqual(await values("Labels"), []);
    assert.deepEqual(await values("Other"), ["kept"]);
    const roster = await request("GET", "/api/games/ann-game", ann);
    assert.deepEqual(roster.body.attributes, [
      { name: "Labels", type: "number" },
      { name: "Other", type: "text" },
    ]);
  });

  describe("saving the whole list (the editor's Save)", () => {
    const save = (attributes: unknown, cookie: string | undefined = ann) =>
      request("PUT", A, cookie, { attributes });

    it("renames, retypes, removes and adds in one go, in the order given", async () => {
      await add("Color", "list");
      await add("Age");
      const [color, age, owner] = (await add("Owner")).body;
      await fill(color.id, "E1", ["Red"]);
      await fill(age.id, "E1", ["3"]);
      await fill(owner.id, "E1", ["Niki"]);
      const res = await save([
        { id: owner.id, name: "Owners", type: "text" },
        { name: "Size", type: "number" },
        { id: age.id, name: "Age", type: "number" },
      ]);
      assert.equal(res.status, 200);
      assert.deepEqual(
        res.body.map((a: Body) => [a.name, a.type]),
        [
          ["Owners", "text"],
          ["Size", "number"],
          ["Age", "number"],
        ],
      );
      assert.equal(res.body[0].id, owner.id);
      assert.deepEqual(await values("Owners"), ["Niki"]);
      assert.deepEqual(await values("Age"), []);
      assert.equal(
        (
          await db.pool.query(
            "select 1 from entry_values where attribute_id = $1",
            [color.id],
          )
        ).rowCount,
        0,
      );
    });

    it("swaps two names in one save", async () => {
      await add("A");
      const [a, b] = (await add("B")).body;
      const res = await save([
        { id: a.id, name: "B", type: "text" },
        { id: b.id, name: "A", type: "text" },
      ]);
      assert.equal(res.status, 200);
      assert.deepEqual(
        res.body.map((x: Body) => x.name),
        ["B", "A"],
      );
    });

    it("refuses bad lists whole, changing nothing", async () => {
      const [a] = (await add("A")).body;
      const foreign = (
        await db.pool.query(
          "select id::int from attributes order by id limit 1",
        )
      ).rows[0].id;
      for (const [list, status, error] of [
        [[{ name: "", type: "text" }], 400, "invalid"],
        [[{ name: "X", type: "date" }], 400, "invalid"],
        [[{ id: "1", name: "X", type: "text" }], 400, "invalid"],
        ["nope", 400, "invalid"],
        [
          [
            { id: a.id, name: "X", type: "text" },
            { id: a.id, name: "Y", type: "text" },
          ],
          400,
          "invalid",
        ],
        [
          Array(MAX_ATTRIBUTES + 1).fill({ name: "X", type: "text" }),
          400,
          "invalid",
        ],
        [[{ id: foreign, name: "X", type: "text" }], 404, "not_found"],
        [
          [
            { id: a.id, name: "Same", type: "text" },
            { name: " same ", type: "list" },
          ],
          409,
          "attribute_exists",
        ],
      ] as const) {
        const res = await save(list);
        assert.equal(res.status, status, JSON.stringify(list));
        assert.equal(res.body.error, error, JSON.stringify(list));
      }
      const now = await request("GET", A, ann);
      assert.deepEqual(
        now.body.map((x: Body) => x.name),
        ["A"],
      );
    });

    it("an unchanged list keeps an approved game approved; a change sends it to pending", async () => {
      const [a] = (await add("A")).body;
      await db.pool.query("update games set status = 'approved'");
      await save([{ id: a.id, name: "A", type: "text" }]);
      assert.equal(await statusOf(), "approved");
      await save([{ id: a.id, name: "A", type: "number" }]);
      assert.equal(await statusOf(), "pending");
    });

    it("a pure reorder keeps the status; a reorder with any other change does not", async () => {
      await add("A");
      await add("B");
      const [a, b, c] = (await add("C", "number")).body;
      for (const status of ["approved", "rejected"]) {
        await db.pool.query("update games set status = $1", [status]);
        const res = await save([c, a, b]);
        assert.equal(res.status, 200);
        assert.deepEqual(
          res.body.map((x: Body) => x.name),
          ["C", "A", "B"],
        );
        assert.equal(await statusOf(), status);
        await save([a, b, c]);
      }
      await db.pool.query("update games set status = 'approved'");
      await save([b, { ...a, name: "A2" }, c]);
      assert.equal(await statusOf(), "pending");
    });

    it("is owner/admin only", async () => {
      const bob = await login("bob@example.test");
      await db.pool.query("update games set status = 'approved'");
      assert.equal(
        (await request("PUT", A, undefined, { attributes: [] })).status,
        401,
      );
      assert.equal((await save([], bob)).status, 403);
    });
  });

  it("removing an attribute hard-deletes its values", async () => {
    const [a] = (await add("A", "list")).body;
    const [, b] = (await add("B")).body;
    await fill(a.id, "E1", ["x"]);
    const res = await request("DELETE", `${A}/${a.id}`, ann);
    assert.deepEqual(
      res.body.map((x: Body) => x.id),
      [b.id],
    );
    const left = await db.pool.query(
      "select 1 from entry_values where attribute_id = $1",
      [a.id],
    );
    assert.equal(left.rowCount, 0);
  });

  it("any schema change sends approved and rejected games to pending, not drafts", async () => {
    const edits: Record<string, (id: number) => Promise<unknown>> = {
      add: () => add("Another"),
      rename: (id) => change(id, { name: "Renamed" }),
      retype: (id) => change(id, { type: "list" }),
      remove: (id) => request("DELETE", `${A}/${id}`, ann),
    };
    for (const [from, after] of [
      ["draft", "draft"],
      ["approved", "pending"],
      ["rejected", "pending"],
      ["pending", "pending"],
    ]) {
      for (const edit of Object.values(edits)) {
        await db.pool.query(
          "delete from attributes where game_id = (select id from games where slug = 'ann-game')",
        );
        const [attr] = (await add("A")).body;
        await db.pool.query("update games set status = $1", [from]);
        await edit(attr.id);
        assert.equal(await statusOf(), after);
      }
    }
  });

  it("a no-op rename or retype keeps an approved game approved", async () => {
    const [attr] = (await add("A")).body;
    await db.pool.query("update games set status = 'approved'");
    await change(attr.id, { name: "A", type: "text" });
    assert.equal(await statusOf(), "approved");
  });
});
