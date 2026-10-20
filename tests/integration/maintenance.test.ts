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

describe("maintenance mode", () => {
  let db: TestDb;
  let server: Server;
  let url: string;
  let boss: string;
  let ann: string;

  const send = async (
    method: string,
    path: string,
    cookie: string | null = null,
    body?: unknown,
  ): Promise<{ status: number; location: string | null; body: unknown }> => {
    const res = await fetch(`${url}${path}`, {
      method,
      redirect: "manual",
      headers: {
        "Content-Type": "application/json",
        ...(cookie !== null && { Cookie: cookie }),
      },
      ...(body !== undefined && { body: JSON.stringify(body) }),
    });
    const text = await res.text();
    return {
      status: res.status,
      location: res.headers.get("location"),
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
  const toggle = (cookie: string | null, on: unknown) =>
    send("PUT", "/api/admin/maintenance", cookie, { on });

  beforeAll(async () => {
    db = await startDb();
    await migrate(db.pool, MIGRATIONS_DIR);
    server = await new Promise<Server>((resolve) => {
      const s = createApp({ pool: db.pool, testLogin: true }).listen(
        0,
        "127.0.0.1",
        () => resolve(s),
      );
    });
    url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(async () => {
    server.close();
    await db.stop();
  });
  beforeEach(async () => {
    await db.pool.query("update site_settings set maintenance = false");
    boss = await login("boss@x.test", true);
    ann = await login("ann@x.test");
  });

  it("is off by default and only admins switch it", async () => {
    assert.deepEqual((await send("GET", "/api/maintenance")).body, {
      on: false,
    });
    assert.equal((await toggle(null, true)).status, 401);
    assert.equal((await toggle(ann, true)).status, 403);
    assert.equal((await toggle(boss, "yes")).status, 400);
    assert.deepEqual((await toggle(boss, true)).body, { on: true });
    assert.deepEqual((await send("GET", "/api/maintenance")).body, {
      on: true,
    });
  });

  it("blocks pages and the API, but keeps sign-in and the off switch", async () => {
    assert.equal((await send("GET", `/api/games/${GAME}`)).status, 200);
    await toggle(boss, true);
    assert.deepEqual(await send("GET", `/api/games/${GAME}`, ann), {
      status: 503,
      location: null,
      body: { error: "maintenance" },
    });
    assert.equal((await send("GET", "/api/admin/users", boss)).status, 503);
    for (const page of [`/g/${GAME}`, "/how-to-play", "/nope"]) {
      const out = await send("GET", page);
      assert.equal(out.status, 302, page);
      assert.equal(out.location, "/", page);
    }
    // The maintenance page, sign-in and the admin panel are not redirected
    for (const page of ["/", "/login", "/verify", "/admin"]) {
      assert.notEqual((await send("GET", page)).status, 302, page);
    }
    assert.equal((await send("GET", "/api/me", ann)).status, 200);
    assert.deepEqual((await toggle(boss, false)).body, { on: false });
    assert.equal((await send("GET", `/api/games/${GAME}`)).status, 200);
  });
});
