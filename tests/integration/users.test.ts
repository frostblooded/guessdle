import assert from "node:assert/strict";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, beforeEach, describe, it } from "node:test";
import { createApp } from "../../src/server/app.ts";
import { MIGRATIONS_DIR } from "../../src/server/main.ts";
import { migrate } from "../../src/server/migrate.ts";
import { startDb } from "./postgres.ts";
import type { TestDb } from "./postgres.ts";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Body = any;
interface Reply {
  status: number;
  body: Body;
}

describe("admin Users: list, promote, demote", () => {
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
  const setFlag = (
    cookie: string | null,
    id: number | string,
    admin: unknown,
  ): Promise<Reply> => send("PUT", `/api/admin/users/${id}`, cookie, { admin });
  const adminCount = async (): Promise<number> =>
    (await db.pool.query("select count(*)::int c from users where admin"))
      .rows[0].c as number;

  before(async () => {
    db = await startDb();
    await migrate(db.pool, MIGRATIONS_DIR);
    server = await new Promise<Server>((resolve) => {
      const s = createApp({
        pool: db.pool,
        now: () => new Date("2026-10-16T10:00:00Z"),
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

  it("answers 401 without a session and 403 to a non-admin, changing nothing", async () => {
    const player = await login("p@x.test");
    const id = await idOf("p@x.test");
    assert.equal((await send("GET", "/api/admin/users", null)).status, 401);
    assert.equal((await send("GET", "/api/admin/users", player)).status, 403);
    assert.equal((await setFlag(player, id, true)).status, 403);
    assert.equal((await setFlag(null, id, true)).status, 401);
    assert.equal(await adminCount(), 0);
  });

  it("lists name, email, last seen and role, nothing more", async () => {
    const boss = await login("boss@x.test", true);
    await login("ann@x.test");
    const { status, body } = await send("GET", "/api/admin/users", boss);
    assert.equal(status, 200);
    assert.deepEqual(
      body.users.map((u: Body) => [u.email, u.admin]),
      [
        ["ann@x.test", false],
        ["boss@x.test", true],
      ],
    );
    const ann = body.users[0];
    assert.deepEqual(Object.keys(ann).sort(), [
      "admin",
      "email",
      "id",
      "lastSeen",
      "name",
    ]);
    assert.ok(!Number.isNaN(Date.parse(ann.lastSeen)));
  });

  it("promotes and demotes, effective on the target's next request", async () => {
    const boss = await login("boss@x.test", true);
    const ann = await login("ann@x.test");
    const annId = await idOf("ann@x.test");
    assert.equal((await send("GET", "/api/admin/users", ann)).status, 403);

    assert.equal((await setFlag(boss, annId, true)).status, 200);
    assert.equal((await send("GET", "/api/me", ann)).body.user.admin, true);
    assert.equal((await send("GET", "/api/admin/users", ann)).status, 200);

    assert.equal((await setFlag(boss, annId, false)).status, 200);
    assert.equal((await send("GET", "/api/me", ann)).body.user.admin, false);
    assert.equal((await send("GET", "/api/admin/users", ann)).status, 403);
  });

  it("is idempotent: repeating a promotion or demotion succeeds", async () => {
    const boss = await login("boss@x.test", true);
    await login("ann@x.test");
    const annId = await idOf("ann@x.test");
    assert.equal((await setFlag(boss, annId, false)).status, 200);
    assert.equal((await setFlag(boss, annId, true)).status, 200);
    assert.equal((await setFlag(boss, annId, true)).status, 200);
    assert.equal(await adminCount(), 2);
  });

  it("rejects self-demotion even with other admins", async () => {
    const boss = await login("boss@x.test", true);
    await login("two@x.test", true);
    const res = await setFlag(boss, await idOf("boss@x.test"), false);
    assert.equal(res.status, 409);
    assert.equal(res.body.error, "self_demotion");
    assert.equal(await adminCount(), 2);
  });

  it("rejects demoting the last admin", async () => {
    const a = await login("a@x.test", true);
    const b = await login("b@x.test", true);
    assert.equal((await setFlag(a, await idOf("b@x.test"), false)).status, 200);
    // b lost admin at once; a is the last admin and nobody can demote them
    assert.equal((await setFlag(b, await idOf("a@x.test"), false)).status, 403);
    assert.equal(await adminCount(), 1);
  });

  it("two admins demoting each other at once leave exactly one admin", async () => {
    for (let round = 0; round < 10; round++) {
      await db.pool.query("delete from users");
      const a = await login("a@x.test", true);
      const b = await login("b@x.test", true);
      const [aId, bId] = [await idOf("a@x.test"), await idOf("b@x.test")];
      const replies = await Promise.all([
        setFlag(a, bId, false),
        setFlag(b, aId, false),
      ]);
      assert.equal(await adminCount(), 1, `round ${round}`);
      assert.ok(replies.some((r) => r.status === 200));
      assert.ok(replies.every((r) => [200, 403, 409].includes(r.status)));
    }
  });

  it("returns 404 for an unknown user", async () => {
    const boss = await login("boss@x.test", true);
    const res = await setFlag(boss, 999999, true);
    assert.equal(res.status, 404);
    assert.equal(res.body.error, "not_found");
  });

  it("rejects malformed ids and bodies", async () => {
    const boss = await login("boss@x.test", true);
    await login("ann@x.test");
    const annId = await idOf("ann@x.test");
    for (const id of ["abc", "0", "-1", "1.5", "99999999999", "01"]) {
      assert.equal((await setFlag(boss, id, true)).status, 400, id);
    }
    for (const admin of ["true", 1, null, undefined]) {
      assert.equal((await setFlag(boss, annId, admin)).status, 400);
    }
    assert.equal(await adminCount(), 1);
  });

  it("rejects a non-JSON change", async () => {
    const boss = await login("boss@x.test", true);
    await login("ann@x.test");
    const res = await fetch(
      `${url}/api/admin/users/${await idOf("ann@x.test")}`,
      {
        method: "PUT",
        headers: { Cookie: boss, "Content-Type": "text/plain" },
        body: JSON.stringify({ admin: true }),
      },
    );
    assert.equal(res.status, 415);
    assert.equal(await adminCount(), 1);
  });
});
