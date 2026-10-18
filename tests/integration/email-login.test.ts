import assert from "node:assert/strict";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";
import { createApp, type AppDeps } from "../../src/server/app.ts";
import { hash } from "../../src/server/auth.ts";
import { MIGRATIONS_DIR } from "../../src/server/main.ts";
import type { Mailer } from "../../src/server/mailer.ts";
import { migrate } from "../../src/server/migrate.ts";
import { tokenIn } from "./mailpit.ts";
import { startDb } from "./postgres.ts";
import type { TestDb } from "./postgres.ts";

const START = new Date("2026-10-16T10:00:00Z");
const MINUTE = 60_000;
const PUBLIC_URL = "https://site.test";

interface Sent {
  to: string;
  subject: string;
  text: string;
}

describe("email magic-link sign-in", () => {
  let db: TestDb;
  let clock: Date;
  let sent: Sent[];
  let failSend: boolean;
  const servers: Server[] = [];
  const mailer: Mailer = {
    send(message: Sent): Promise<void> {
      if (failSend) {
        return Promise.reject(new Error("smtp down"));
      }
      sent.push(message);
      return Promise.resolve();
    },
  };

  const serve = async (extra: Partial<AppDeps> = {}): Promise<string> => {
    const server = await new Promise<Server>((resolve) => {
      const s = createApp({
        pool: db.pool,
        now: () => clock,
        mail: { mailer, publicUrl: PUBLIC_URL },
        ...extra,
      }).listen(0, "127.0.0.1", () => resolve(s));
    });
    servers.push(server);
    return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  };
  let url: string;

  const post = (
    path: string,
    body: unknown,
    base: string = url,
    headers: Record<string, string> = {},
  ): Promise<Response> =>
    fetch(`${base}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
    });
  const request = (email: unknown, base: string = url): Promise<Response> =>
    post("/api/auth/email/request", { email }, base);
  const verify = (token: unknown, base: string = url): Promise<Response> =>
    post("/api/auth/email/verify", { token }, base);
  // Requests a link and returns its token
  const link = async (email: string): Promise<string> => {
    const count0 = sent.length;
    assert.equal((await request(email)).status, 200);
    assert.equal(sent.length, count0 + 1, "a mail was sent");
    return tokenIn(sent.at(-1)!.text);
  };
  const count = async (table: string, where = "true"): Promise<number> =>
    Number(
      (await db.pool.query(`select count(*) from ${table} where ${where}`))
        .rows[0].count,
    );
  const me = async (cookie: string, base: string = url): Promise<unknown> =>
    (
      (await (
        await fetch(`${base}/api/me`, { headers: { Cookie: cookie } })
      ).json()) as { user: unknown }
    ).user;
  const cookieOf = (res: Response): string =>
    /^(sid=[^;]+)/.exec(res.headers.get("set-cookie") ?? "")![1]!;
  const later = (ms: number): void => {
    clock = new Date(clock.getTime() + ms);
  };

  beforeAll(async () => {
    db = await startDb();
    await migrate(db.pool, MIGRATIONS_DIR);
    url = await serve();
  });
  afterAll(async () => {
    for (const s of servers) {
      s.close();
    }
    await db.stop();
  });
  beforeEach(async () => {
    await db.pool.query("delete from users");
    await db.pool.query("delete from login_tokens");
    clock = START;
    sent = [];
    failSend = false;
  });

  describe("requesting a link", () => {
    it("answers 200 and mails a one-time link with the expiry", async () => {
      const res = await request("ann@x.test");
      assert.equal(res.status, 200);
      assert.deepEqual(await res.json(), { ok: true });
      assert.equal(sent.length, 1);
      assert.equal(sent[0]!.to, "ann@x.test");
      assert.match(
        sent[0]!.text,
        new RegExp(`${PUBLIC_URL}/verify\\?token=[\\w-]{43}`),
      );
      assert.match(sent[0]!.text, /15 minutes/);
    });

    it("answers identically for known and unknown addresses (no enumeration)", async () => {
      await verify(await link("known@x.test"));
      later(2 * MINUTE);
      const known = await request("known@x.test");
      const unknown = await request("nobody@x.test");
      assert.equal(known.status, unknown.status);
      assert.deepEqual(await known.json(), await unknown.json());
      assert.equal(sent.length, 3);
    });

    it("trims and lowercases the address", async () => {
      await request("  Ann@X.TEST ");
      assert.equal(sent[0]!.to, "ann@x.test");
    });

    it("rejects a malformed address with 400 and sends nothing", async () => {
      for (const bad of ["", "ann", "a@b", 5, null, "a@x.test,b@x.test"]) {
        const res = await request(bad);
        assert.equal(res.status, 400, String(bad));
        assert.deepEqual(await res.json(), { error: "invalid_email" });
      }
      assert.equal((await post("/api/auth/email/request", {})).status, 400);
      assert.equal(sent.length, 0);
      assert.equal(await count("login_tokens"), 0);
    });

    it("stores only a hash of the token", async () => {
      const token = await link("ann@x.test");
      const { rows } = await db.pool.query("select * from login_tokens");
      assert.equal(rows.length, 1);
      assert.equal(rows[0].token_hash, hash(token));
      assert.ok(!JSON.stringify(rows).includes(token));
    });

    it("issues a distinct token per request", async () => {
      const a = await link("a@x.test");
      const b = await link("b@x.test");
      assert.notEqual(a, b);
    });

    it("answers 503 login_unavailable when no SMTP is configured", async () => {
      const base = await serve({ mail: undefined });
      const res = await request("ann@x.test", base);
      assert.equal(res.status, 503);
      assert.deepEqual(await res.json(), { error: "login_unavailable" });
      assert.equal(await count("login_tokens"), 0);
    });

    it("answers 503 when the mail server fails", async () => {
      failSend = true;
      const res = await request("ann@x.test");
      assert.equal(res.status, 503);
      assert.deepEqual(await res.json(), { error: "login_unavailable" });
    });

    it("is behind the CSRF guard", async () => {
      const text = await fetch(`${url}/api/auth/email/request`, {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: JSON.stringify({ email: "ann@x.test" }),
      });
      assert.equal(text.status, 415);
      const foreign = await post(
        "/api/auth/email/request",
        { email: "ann@x.test" },
        url,
        { Origin: "https://evil.example" },
      );
      assert.equal(foreign.status, 403);
      assert.equal(sent.length, 0);
    });
  });

  describe("per-address limits", () => {
    it("answers 200 but sends nothing for a second request within a minute", async () => {
      await request("ann@x.test");
      later(59_000);
      const again = await request("ann@x.test");
      assert.equal(again.status, 200);
      assert.deepEqual(await again.json(), { ok: true });
      assert.equal(sent.length, 1);
      assert.equal(await count("login_tokens"), 1);
    });

    it("counts the address case-insensitively", async () => {
      await request("ann@x.test");
      await request("ANN@x.test");
      assert.equal(sent.length, 1);
    });

    it("allows another after a minute", async () => {
      await request("ann@x.test");
      later(MINUTE + 1);
      await request("ann@x.test");
      assert.equal(sent.length, 2);
    });

    it("allows 5 an hour, then holds the 6th until the hour has passed", async () => {
      for (let i = 0; i < 5; i++) {
        await request("ann@x.test");
        later(MINUTE + 1);
      }
      assert.equal(sent.length, 5);
      await request("ann@x.test");
      assert.equal(sent.length, 5);
      clock = new Date(START.getTime() + 61 * MINUTE);
      await request("ann@x.test");
      assert.equal(sent.length, 6);
    });

    it("limits each address on its own", async () => {
      await request("a@x.test");
      await request("b@x.test");
      assert.equal(sent.length, 2);
    });

    it("purges long-expired tokens on the next request", async () => {
      await request("old@x.test");
      clock = new Date(START.getTime() + 3 * 60 * MINUTE);
      await request("new@x.test");
      assert.equal(await count("login_tokens"), 1);
      assert.equal(await count("login_tokens", "email = 'new@x.test'"), 1);
    });
  });

  describe("verifying a link", () => {
    it("creates the user, starts a session cookie and signs in", async () => {
      const res = await verify(await link("Ann@X.test"));
      assert.equal(res.status, 200);
      assert.deepEqual(await res.json(), { ok: true });
      const cookie = res.headers.get("set-cookie")!;
      assert.match(cookie, /HttpOnly/);
      assert.match(cookie, /SameSite=Lax/);
      assert.deepEqual(await me(cookieOf(res)), {
        name: "ann@x.test",
        email: "ann@x.test",
        username: null,
        admin: false,
      });
      assert.equal(await count("users"), 1);
    });

    it("works once: reuse is 400 invalid_token and starts no session", async () => {
      const token = await link("ann@x.test");
      assert.equal((await verify(token)).status, 200);
      const sessions = await count("sessions");
      const again = await verify(token);
      assert.equal(again.status, 400);
      assert.deepEqual(await again.json(), { error: "invalid_token" });
      assert.equal(again.headers.get("set-cookie"), null);
      assert.equal(await count("sessions"), sessions);
    });

    it("lets only one of several simultaneous attempts win", async () => {
      const token = await link("ann@x.test");
      const statuses = (
        await Promise.all([verify(token), verify(token), verify(token)])
      ).map((r) => r.status);
      assert.deepEqual(statuses.sort(), [200, 400, 400]);
      assert.equal(await count("users"), 1);
    });

    it("rejects an expired token (15 minutes)", async () => {
      const token = await link("ann@x.test");
      later(15 * MINUTE + 1);
      assert.equal((await verify(token)).status, 400);
      assert.equal(await count("users"), 0);
    });

    it("accepts a token just inside its lifetime", async () => {
      const token = await link("ann@x.test");
      later(15 * MINUTE - 1);
      assert.equal((await verify(token)).status, 200);
    });

    it("rejects unknown, empty, oversized and non-string tokens", async () => {
      for (const bad of ["nope", "", "x".repeat(201), 5, null]) {
        const res = await verify(bad);
        assert.equal(res.status, 400, String(bad));
        assert.deepEqual(await res.json(), { error: "invalid_token" });
      }
      assert.equal((await post("/api/auth/email/verify", {})).status, 400);
    });

    it("burns nothing on GET: a scanner prefetching the link cannot consume it", async () => {
      const token = await link("ann@x.test");
      for (const path of [
        `/api/auth/email/verify?token=${token}`,
        `/verify?token=${token}`,
      ]) {
        const res = await fetch(`${url}${path}`);
        assert.equal(res.headers.get("set-cookie"), null);
      }
      assert.equal(await count("sessions"), 0);
      assert.equal((await verify(token)).status, 200);
    });

    it("is behind the CSRF guard", async () => {
      const token = await link("ann@x.test");
      const text = await fetch(`${url}/api/auth/email/verify`, {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: JSON.stringify({ token }),
      });
      assert.equal(text.status, 415);
      const foreign = await post("/api/auth/email/verify", { token }, url, {
        Origin: "https://evil.example",
      });
      assert.equal(foreign.status, 403);
      assert.equal((await verify(token)).status, 200, "token untouched");
    });

    it("reuses the user on later sign-ins", async () => {
      await verify(await link("ann@x.test"));
      later(2 * MINUTE);
      await verify(await link("ANN@x.test"));
      assert.equal(await count("users"), 1);
      assert.equal(await count("sessions"), 2);
    });

    it("matches an existing Google-era user by email, ignoring case", async () => {
      await db.pool.query(
        "insert into users (google_sub, email, name) values ('g-1', 'Ann@X.test', 'Ann G')",
      );
      const res = await verify(await link("ann@x.test"));
      assert.equal(await count("users"), 1);
      assert.deepEqual(await me(cookieOf(res)), {
        name: "Ann G",
        email: "Ann@X.test",
        username: null,
        admin: false,
      });
      assert.equal(await count("users", "google_sub = 'g-1'"), 1);
    });
  });

  describe("admin emails", () => {
    const list = ["boss@x.test"];
    // Signs in by email against a server with this admin list; true if admin
    const adminOf = async (base: string, email: string): Promise<unknown> => {
      const count0 = sent.length;
      await request(email, base);
      assert.equal(sent.length, count0 + 1);
      const res = await verify(tokenIn(sent.at(-1)!.text), base);
      return ((await me(cookieOf(res), base)) as { admin: boolean }).admin;
    };

    it("promotes a listed email on sign-in, never another", async () => {
      const base = await serve({ adminEmails: list });
      assert.equal(await adminOf(base, "Boss@X.test"), true);
      assert.equal(await adminOf(base, "other@x.test"), false);
    });

    it("promotes an existing user once their email is listed", async () => {
      await verify(await link("boss@x.test"));
      later(2 * MINUTE);
      const base = await serve({ adminEmails: list });
      assert.equal(await adminOf(base, "boss@x.test"), true);
    });

    it("never demotes: leaving the list keeps the flag", async () => {
      assert.equal(
        await adminOf(await serve({ adminEmails: list }), "boss@x.test"),
        true,
      );
      later(2 * MINUTE);
      assert.equal(
        await adminOf(await serve({ adminEmails: [] }), "boss@x.test"),
        true,
      );
    });
  });
});
