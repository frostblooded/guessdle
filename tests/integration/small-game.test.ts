import assert from "node:assert/strict";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, afterEach, beforeAll, describe, it } from "vitest";
import { createApp } from "../../src/server/app.ts";
import { MIGRATIONS_DIR } from "../../src/server/main.ts";
import { migrate } from "../../src/server/migrate.ts";
import { startDb } from "./postgres.ts";
import type { TestDb } from "./postgres.ts";

const NOW = new Date("2026-10-16T10:00:00Z");
const G = "/api/games/tiny";

// The owner of a game with fewer than 2 entries may open it, but no Daily Answer can be drawn
describe("a game with too few entries, opened by its owner", () => {
  let db: TestDb;
  let server: Server;
  let url: string;
  let cookie: string;

  const send = async (
    method: string,
    path: string,
    body: unknown = {},
  ): Promise<{ status: number; body: { error?: string } }> => {
    const res = await fetch(`${url}${path}`, {
      method,
      headers: { "Content-Type": "application/json", Cookie: cookie },
      ...(method === "POST" && { body: JSON.stringify(body) }),
    });
    return { status: res.status, body: (await res.json()) as never };
  };
  const makeGame = async (entries: number): Promise<void> => {
    await db.pool.query(
      `insert into games (slug, name, status, start_date, owner_id)
       select 'tiny', 'Tiny', 'draft', '2026-10-16', id from users where email = 'owner@x.test'`,
    );
    for (let i = 0; i < entries; i++) {
      await db.pool.query(
        "insert into entries (game_id, name) select id, $1 from games where slug = 'tiny'",
        [`E${i}`],
      );
    }
  };

  beforeAll(async () => {
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
    const res = await fetch(`${url}/api/test/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "owner@x.test" }),
    });
    cookie = res.headers.get("set-cookie")!.split(";")[0]!;
  });
  afterAll(async () => {
    server.close();
    await db.stop();
  });
  afterEach(async () => {
    await db.pool.query("delete from games where slug = 'tiny'");
  });

  for (const entries of [0, 1]) {
    it(`answers 409 not_enough_entries, never a 500, with ${entries} entries`, async () => {
      await makeGame(entries);
      assert.equal((await send("GET", G)).status, 200);
      for (const [method, path] of [
        ["POST", `${G}/grade`],
        ["POST", `${G}/give-up`],
        ["GET", `${G}/state`],
        ["POST", `${G}/state/guess`],
      ] as const) {
        const res = await send(method, path, { ids: [] });
        assert.deepEqual(
          [res.status, res.body.error],
          [409, "not_enough_entries"],
          path,
        );
      }
      const { rows } = await db.pool.query(
        "select 1 from daily_answers where game_id = (select id from games where slug = $1)",
        ["tiny"],
      );
      assert.equal(rows.length, 0);
    });
  }
});
