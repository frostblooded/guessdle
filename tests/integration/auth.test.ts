import assert from "node:assert/strict";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, beforeEach, describe, it } from "node:test";
import { createApp, type AppDeps } from "../../src/server/app.ts";
import {
  upsertUser,
  startSession,
  type SessionUser,
} from "../../src/server/auth.ts";
import { MIGRATIONS_DIR } from "../../src/server/main.ts";
import { migrate } from "../../src/server/migrate.ts";
import { startDb } from "./postgres.ts";
import type { TestDb } from "./postgres.ts";

const DAY = 24 * 60 * 60 * 1000;
const START = new Date("2026-10-16T10:00:00Z");
describe("Sessions and CSRF protection", () => {
  let db: TestDb;
  const servers: Server[] = [];
  let clock: Date;

  const serve = async (extra: Partial<AppDeps> = {}): Promise<string> => {
    const server = await new Promise<Server>((resolve) => {
      const s = createApp({
        pool: db.pool,
        now: () => clock,
        ...extra,
      }).listen(0, "127.0.0.1", () => resolve(s));
    });
    servers.push(server);
    return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  };

  let url: string;
  let testUrl: string;

  const json = (body: unknown = {}): RequestInit => ({
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const withCookie = (token: string, init: RequestInit = {}): RequestInit => ({
    ...init,
    headers: { ...(init.headers as object), Cookie: `sid=${token}` },
  });
  // A user as email sign-in would create them, plus a session for them
  const signIn = async (
    email: string,
    adminEmails: string[] = [],
  ): Promise<{ user: SessionUser; token: string }> => {
    const user = await upsertUser(
      db.pool,
      email,
      email,
      adminEmails.includes(email),
    );
    assert.ok(user, "signed in");
    return { user, token: await startSession(db.pool, user.id, clock) };
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const me = async (token?: string, base: string = url): Promise<any> => {
    const res = await fetch(
      `${base}/api/me`,
      token === undefined ? undefined : withCookie(token),
    );
    return { status: res.status, ...((await res.json()) as object) };
  };
  const count = async (table: string): Promise<number> =>
    Number(
      (await db.pool.query(`select count(*) from ${table}`)).rows[0].count,
    );

  before(async () => {
    db = await startDb();
    await migrate(db.pool, MIGRATIONS_DIR);
    clock = START;
    url = await serve();
    testUrl = await serve({ testLogin: true });
  });
  after(async () => {
    for (const s of servers) {
      s.close();
    }
    await db.stop();
  });
  beforeEach(async () => {
    await db.pool.query("delete from users");
    clock = START;
  });

  describe("sessions", () => {
    it("reports no user without a cookie, with a bogus one, or an empty one", async () => {
      assert.deepEqual(await me(), { status: 200, user: null });
      assert.equal((await me("nope")).user, null);
      assert.equal((await me("")).user, null);
    });

    it("reports the signed-in user, without ids or secrets", async () => {
      const { token } = await signIn("ann@x.test");
      const body = await me(token);
      assert.deepEqual(body.user, {
        name: "ann@x.test",
        email: "ann@x.test",
        admin: false,
      });
    });

    it("stores only a hash of the token", async () => {
      const { token } = await signIn("ann@x.test");
      const { rows } = await db.pool.query("select token_hash from sessions");
      assert.equal(rows.length, 1);
      assert.notEqual(rows[0].token_hash, token);
      assert.ok(!JSON.stringify(rows).includes(token));
    });

    it("issues long random tokens", async () => {
      const a = await signIn("a@x.test");
      const b = await signIn("b@x.test");
      assert.notEqual(a.token, b.token);
      assert.ok(a.token.length >= 40);
    });

    it("takes effect on the next request when the session row is deleted", async () => {
      const { token } = await signIn("ann@x.test");
      assert.ok((await me(token)).user);
      await db.pool.query("delete from sessions");
      assert.equal((await me(token)).user, null);
    });

    it("takes effect on the next request when the user is deleted", async () => {
      const { token } = await signIn("ann@x.test");
      await db.pool.query("delete from users");
      assert.equal((await me(token)).user, null);
    });

    it("reflects an admin flag change on the next request", async () => {
      const { token } = await signIn("ann@x.test");
      await db.pool.query("update users set admin = true");
      assert.equal((await me(token)).user.admin, true);
    });

    it("expires 30 days after the last use", async () => {
      const { token } = await signIn("ann@x.test");
      clock = new Date(START.getTime() + 29 * DAY);
      assert.ok((await me(token)).user);
      clock = new Date(START.getTime() + 60 * DAY);
      assert.equal((await me(token)).user, null);
    });

    it("rolls: each use pushes the expiry 30 days out", async () => {
      const { token } = await signIn("ann@x.test");
      clock = new Date(START.getTime() + 20 * DAY);
      assert.ok((await me(token)).user);
      clock = new Date(START.getTime() + 49 * DAY);
      assert.ok((await me(token)).user);
      clock = new Date(START.getTime() + 49 * DAY + 31 * DAY);
      assert.equal((await me(token)).user, null);
    });

    it("an expired session does not come back", async () => {
      const { token } = await signIn("ann@x.test");
      clock = new Date(START.getTime() + 31 * DAY);
      assert.equal((await me(token)).user, null);
    });

    it("records last seen on use", async () => {
      const { token } = await signIn("ann@x.test");
      clock = new Date(START.getTime() + 2 * DAY);
      await me(token);
      const { rows } = await db.pool.query("select last_seen from users");
      assert.equal(rows[0].last_seen.getTime(), clock.getTime());
    });

    it("looks the session up once per request, not once per middleware", async () => {
      const { token } = await signIn("ann@x.test");
      let updates = 0;
      const counting = {
        query: (...args: unknown[]) => {
          if (String(args[0]).includes("update sessions")) {
            updates++;
          }
          return (db.pool.query as (...a: unknown[]) => unknown)(...args);
        },
        connect: () => db.pool.connect(),
      };
      const base = await serve({ pool: counting as never });
      assert.ok((await me(token, base)).user);
      assert.equal(updates, 1);
    });

    it("purges expired sessions when someone logs in", async () => {
      await signIn("old@x.test");
      assert.equal(await count("sessions"), 1);
      clock = new Date(START.getTime() + 31 * DAY);
      await signIn("new@x.test");
      assert.equal(await count("sessions"), 1);
      const { rows } = await db.pool.query(
        "select u.email from sessions s join users u on u.id = s.user_id",
      );
      assert.deepEqual(rows, [{ email: "new@x.test" }]);
    });

    it("logout deletes the session; the same cookie is signed out next request", async () => {
      const { token } = await signIn("ann@x.test");
      const res = await fetch(
        `${url}/api/auth/logout`,
        withCookie(token, json()),
      );
      assert.equal(res.status, 200);
      const cookie = res.headers.get("set-cookie") ?? "";
      assert.match(cookie, /^sid=;/);
      assert.match(cookie, /Max-Age=0|Expires=Thu, 01 Jan 1970/);
      assert.equal(await count("sessions"), 0);
      assert.equal((await me(token)).user, null);
    });

    it("logout only ends the caller's session", async () => {
      const a = await signIn("a@x.test");
      const b = await signIn("b@x.test");
      await fetch(`${url}/api/auth/logout`, withCookie(a.token, json()));
      assert.equal((await me(a.token)).user, null);
      assert.ok((await me(b.token)).user);
    });

    it("logout without a session is a harmless success", async () => {
      const res = await fetch(`${url}/api/auth/logout`, json());
      assert.equal(res.status, 200);
    });

    it("never caches the answer to who is signed in", async () => {
      const res = await fetch(`${url}/api/me`);
      assert.match(res.headers.get("cache-control") ?? "", /no-store/);
    });
  });

  describe("CSRF defence on mutating endpoints", () => {
    const post = (path: string, init: RequestInit): Promise<Response> =>
      fetch(`${url}${path}`, { method: "POST", ...init });

    it("rejects a non-JSON content type with 415", async () => {
      for (const type of ["text/plain", "application/x-www-form-urlencoded"]) {
        const res = await post("/api/games/petdle/grade", {
          headers: { "Content-Type": type },
          body: JSON.stringify({ ids: [] }),
        });
        assert.equal(res.status, 415, type);
        assert.deepEqual(await res.json(), { error: "unsupported_media_type" });
      }
    });

    it("rejects a request with no content type", async () => {
      for (const path of [
        "/api/games/petdle/grade",
        "/api/games/petdle/give-up",
        "/api/auth/logout",
      ]) {
        assert.equal((await post(path, {})).status, 415, path);
      }
    });

    it("accepts JSON with a charset parameter", async () => {
      const res = await post("/api/auth/logout", {
        headers: { "Content-Type": "application/json; charset=utf-8" },
        body: "{}",
      });
      assert.equal(res.status, 200);
    });

    it("rejects a mismatched Origin with 403 and does nothing", async () => {
      const { token } = await signIn("ann@x.test");
      for (const origin of [
        "https://evil.test",
        "null",
        "http://127.0.0.1:1",
        "not a url",
      ]) {
        const res = await post("/api/auth/logout", {
          headers: {
            "Content-Type": "application/json",
            Origin: origin,
            Cookie: `sid=${token}`,
          },
          body: "{}",
        });
        assert.equal(res.status, 403, origin);
        assert.deepEqual(await res.json(), { error: "forbidden_origin" });
      }
      assert.ok((await me(token)).user, "session untouched");
    });

    it("accepts the page's own Origin", async () => {
      const res = await post("/api/games/petdle/grade", {
        headers: { "Content-Type": "application/json", Origin: url },
        body: JSON.stringify({ ids: [] }),
      });
      assert.equal(res.status, 200);
    });

    it("does not block reads from another origin (they change nothing)", async () => {
      const res = await fetch(`${url}/api/me`, {
        headers: { Origin: "https://evil.test" },
      });
      assert.equal(res.status, 200);
    });

    it("rejects a foreign Origin even when the content type is wrong too", async () => {
      const res = await post("/api/games/petdle/grade", {
        headers: { "Content-Type": "text/plain", Origin: "https://evil.test" },
        body: "x",
      });
      assert.ok([403, 415].includes(res.status));
    });

    it("also guards unknown mutating routes and other methods", async () => {
      const res = await fetch(`${url}/api/nothing`, {
        method: "DELETE",
        headers: { Origin: "https://evil.test" },
      });
      assert.equal(res.status, 403);
    });
  });

  describe("test-only login route", () => {
    const login = (body: unknown, base: string = testUrl): Promise<Response> =>
      fetch(`${base}/api/test/login`, json(body));

    it("is absent unless the test environment enables it", async () => {
      const res = await login({ email: "a@x.test" }, url);
      assert.equal(res.status, 404);
      assert.equal(await count("users"), 0);
      assert.equal(await count("sessions"), 0);
    });

    it("refuses to be enabled in production", () => {
      const before = process.env["NODE_ENV"];
      process.env["NODE_ENV"] = "production";
      try {
        assert.throws(
          () => createApp({ pool: db.pool, testLogin: true }),
          /production/,
        );
      } finally {
        if (before === undefined) {
          delete process.env["NODE_ENV"];
        } else {
          process.env["NODE_ENV"] = before;
        }
      }
    });

    it("signs in as a user with a session cookie", async () => {
      const res = await login({ email: "ann@x.test", name: "Ann" });
      assert.equal(res.status, 200);
      const cookie = res.headers.get("set-cookie") ?? "";
      const token = /^sid=([^;]+)/.exec(cookie)?.[1];
      assert.ok(token);
      assert.deepEqual((await me(token, testUrl)).user, {
        name: "Ann",
        email: "ann@x.test",
        admin: false,
      });
    });

    it("signs in as an admin on request", async () => {
      const res = await login({ email: "root@x.test", admin: true });
      const token = /^sid=([^;]+)/.exec(res.headers.get("set-cookie")!)![1]!;
      assert.equal((await me(token, testUrl)).user.admin, true);
    });

    it("reuses the user for the same email", async () => {
      await login({ email: "ann@x.test" });
      await login({ email: "ann@x.test" });
      assert.equal(await count("users"), 1);
      assert.equal(await count("sessions"), 2);
    });

    it("rejects a missing or malformed email", async () => {
      for (const body of [{}, { email: "" }, { email: 5 }, { name: "x" }]) {
        assert.equal((await login(body)).status, 400);
      }
      assert.equal(await count("users"), 0);
    });

    it("is itself behind the CSRF guard", async () => {
      const res = await fetch(`${testUrl}/api/test/login`, {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: "{}",
      });
      assert.equal(res.status, 415);
    });
  });

  describe("session cookie attributes", () => {
    const cookieOf = async (base: string): Promise<string> => {
      const res = await fetch(`${base}/api/test/login`, json({ email: "a@x" }));
      return res.headers.get("set-cookie") ?? "";
    };

    it("is HttpOnly, SameSite=Lax, site-wide and lasts 30 days", async () => {
      const cookie = await cookieOf(testUrl);
      assert.match(cookie, /HttpOnly/);
      assert.match(cookie, /SameSite=Lax/);
      assert.match(cookie, /Path=\//);
      assert.match(cookie, /Max-Age=2592000/);
      assert.doesNotMatch(cookie, /Secure/);
    });

    it("is Secure when the app runs behind HTTPS", async () => {
      const base = await serve({ testLogin: true, secureCookies: true });
      assert.match(await cookieOf(base), /; Secure/);
    });
  });
});
