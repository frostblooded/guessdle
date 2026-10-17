import assert from "node:assert/strict";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";
import { createApp } from "../../src/server/app.ts";
import { MIGRATIONS_DIR } from "../../src/server/main.ts";
import { migrate } from "../../src/server/migrate.ts";
import { PET_IDS } from "./petdle.ts";
import { startDb } from "./postgres.ts";
import type { TestDb } from "./postgres.ts";

const NOW = new Date("2026-10-16T10:00:00Z");
const MAX = 5;
const IDS = PET_IDS;
const G = "/api/games/petdle";

describe("abuse protection", () => {
  let db: TestDb;
  let server: Server;
  let url: string;
  let clock: Date;

  const call = (
    path: string,
    { ip, cookie, body, raw }: Opts = {},
  ): Promise<Response> =>
    fetch(`${url}${path}`, {
      method: body !== undefined || raw !== undefined ? "POST" : "GET",
      headers: {
        "Content-Type": "application/json",
        ...(ip && { "X-Forwarded-For": ip }),
        ...(cookie && { Cookie: cookie }),
      },
      ...((body !== undefined || raw !== undefined) && {
        body: raw ?? JSON.stringify(body),
      }),
    });
  interface Opts {
    ip?: string;
    cookie?: string;
    body?: unknown;
    raw?: string;
  }
  const login = async (email: string, ip: string): Promise<string> => {
    const res = await call("/api/test/login", { ip, body: { email } });
    return res.headers.get("set-cookie")!.split(";")[0]!;
  };
  // Sends n health checks and returns the statuses
  const burst = async (n: number, opts: Opts): Promise<number[]> => {
    const out: number[] = [];
    for (let i = 0; i < n; i++) {
      out.push((await call("/api/health", opts)).status);
    }
    return out;
  };

  beforeAll(async () => {
    db = await startDb();
    await migrate(db.pool, MIGRATIONS_DIR);
    server = await new Promise<Server>((resolve) => {
      const s = createApp({
        pool: db.pool,
        now: () => clock,
        testLogin: true,
        limit: { max: MAX, windowMs: 60_000 },
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
    clock = new Date(NOW);
  });

  describe("rate limit", () => {
    it("answers 429 JSON with Retry-After once the budget is spent", async () => {
      const ip = "10.1.0.1";
      assert.deepEqual(await burst(MAX, { ip }), Array(MAX).fill(200));
      const res = await call("/api/health", { ip });
      assert.equal(res.status, 429);
      assert.deepEqual(await res.json(), { error: "rate_limited" });
      assert.equal(res.headers.get("retry-after"), "60");
    });

    it("limits every API route, not only the game", async () => {
      const ip = "10.1.0.2";
      await burst(MAX, { ip });
      for (const [path, body] of [
        [`${G}/grade`, { ids: [] }],
        [`${G}/give-up`, {}],
        ["/api/me", undefined],
        ["/api/nope", undefined],
      ] as const) {
        assert.equal((await call(path, { ip, body })).status, 429, path);
      }
    });

    it("lets the budget refill in the next window", async () => {
      const ip = "10.1.0.3";
      await burst(MAX + 1, { ip });
      clock = new Date(NOW.getTime() + 59_000);
      assert.equal((await call("/api/health", { ip })).status, 429);
      clock = new Date(NOW.getTime() + 60_000);
      assert.equal((await call("/api/health", { ip })).status, 200);
    });

    it("counts anonymous callers per IP", async () => {
      await burst(MAX + 1, { ip: "10.1.0.4" });
      assert.deepEqual(await burst(1, { ip: "10.1.0.5" }), [200]);
    });

    it("counts a signed-in user across devices and IPs, apart from the IP", async () => {
      const a1 = await login("a@x.test", "10.1.0.6");
      const a2 = await login("a@x.test", "10.1.0.7");
      const b = await login("b@x.test", "10.1.0.6");
      // 3 requests as user a from two devices, then 2 more reach the budget
      await burst(3, { cookie: a1, ip: "10.1.0.6" });
      await burst(2, { cookie: a2, ip: "10.1.0.7" });
      assert.deepEqual(await burst(1, { cookie: a1, ip: "10.1.0.8" }), [429]);
      assert.deepEqual(await burst(1, { cookie: a2, ip: "10.1.0.9" }), [429]);
      // another user and the same IPs anonymously are unaffected
      assert.deepEqual(await burst(1, { cookie: b, ip: "10.1.0.8" }), [200]);
      assert.deepEqual(await burst(1, { ip: "10.1.0.8" }), [200]);
    });

    it("does not let a bogus session cookie escape the IP limit", async () => {
      const opts = { ip: "10.1.0.10" };
      for (let i = 0; i < MAX; i++) {
        await call("/api/health", { ...opts, cookie: `sid=fake${i}` });
      }
      const res = await call("/api/health", { ...opts, cookie: "sid=fake9" });
      assert.equal(res.status, 429);
    });

    it("limits the signed-in game routes too", async () => {
      const cookie = await login("c@x.test", "10.1.0.11");
      await burst(MAX, { cookie, ip: "10.1.0.11" });
      const res = await call(`${G}/state/guess`, {
        cookie,
        ip: "10.1.0.11",
        body: { id: IDS[0] },
      });
      assert.equal(res.status, 429);
      assert.deepEqual(await res.json(), { error: "rate_limited" });
    });
  });

  describe("input caps", () => {
    // A fresh IP per test keeps these clear of the rate limit
    let n = 0;
    const ip = (): string => `10.2.0.${++n}`;

    it("rejects bodies over 10 KB on every JSON route", async () => {
      const cookie = await login("d@x.test", ip());
      const big = JSON.stringify({ ids: [], pad: "x".repeat(11 * 1024) });
      for (const path of [
        `${G}/grade`,
        `${G}/state/guess`,
        `${G}/state/merge`,
        `${G}/state/give-up`,
        `${G}/state/reset`,
      ]) {
        const res = await call(path, { cookie, ip: ip(), raw: big });
        assert.equal(res.status, 413, path);
        assert.deepEqual(await res.json(), { error: "invalid" });
      }
    });

    it("accepts a body just under the cap", async () => {
      const res = await call(`${G}/grade`, {
        ip: ip(),
        raw: JSON.stringify({ ids: [], pad: "x".repeat(9 * 1024) }),
      });
      assert.equal(res.status, 200);
    });

    it("rejects more ids than the roster on grade and merge", async () => {
      const cookie = await login("e@x.test", ip());
      const ids = [...IDS, IDS[0]];
      const grade = await call(`${G}/grade`, { ip: ip(), body: { ids } });
      assert.equal(grade.status, 400);
      const merge = await call(`${G}/state/merge`, {
        cookie,
        ip: ip(),
        body: { day: 1, ids },
      });
      assert.equal(merge.status, 400);
      assert.deepEqual(await merge.json(), { error: "invalid", day: 427 });
    });

    it("accepts exactly the roster size", async () => {
      const res = await call(`${G}/grade`, { ip: ip(), body: { ids: IDS } });
      assert.equal(res.status, 200);
    });
  });
});
