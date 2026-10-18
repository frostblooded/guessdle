import assert from "node:assert/strict";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, it } from "vitest";
import { createApp } from "../../src/server/app.ts";
import { MIGRATIONS_DIR } from "../../src/server/main.ts";
import { migrate } from "../../src/server/migrate.ts";
import { GAME, PET_IDS, pid } from "./petdle.ts";
import { startDb } from "./postgres.ts";
import type { TestDb } from "./postgres.ts";

// 2026-10-16 is Day Number 427; the backfill stores "bela" for it
const TODAY = "2026-10-16";
const NOW = new Date(`${TODAY}T10:00:00Z`);
const BELA = pid("bela");
const OTHER = PET_IDS.find((id) => id !== BELA)!;
const G = `/api/games/${GAME}`;
const TOKEN = "aaaaaaaa-0000-4000-8000-000000000001";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Body = any;

describe("changing today's answer restarts the day", () => {
  let db: TestDb;
  let server: Server;
  let url: string;

  const send = async (
    method: string,
    path: string,
    body: unknown,
    cookie = "",
  ): Promise<{ status: number; body: Body }> => {
    const res = await fetch(`${url}${path}`, {
      method,
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: method === "GET" ? null : JSON.stringify(body),
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
  const count = async (table: string): Promise<number> =>
    (await db.pool.query(`select 1 from ${table} where day = $1`, [TODAY]))
      .rowCount!;

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
  });
  afterAll(async () => {
    server.close();
    await db.stop();
  });

  it("wipes today's guesses, give-ups and stats and bumps the revision, only when the answer changes", async () => {
    const admin = await login("admin@example.com", true);
    const player = await login("player@example.com");
    const quitter = await login("quitter@example.com");
    await send("POST", `${G}/state/guess`, { id: OTHER }, player);
    await send("POST", `${G}/state/give-up`, {}, quitter);
    await send("POST", `${G}/result`, { ids: [BELA], player: TOKEN });
    assert.equal(
      (await send("POST", `${G}/grade`, { ids: [] })).body.revision,
      0,
    );

    // The same entry changes nothing
    await send("PUT", `${G}/answers/${TODAY}`, { entryId: BELA }, admin);
    assert.equal(await count("user_guesses"), 1);
    assert.equal(await count("user_give_ups"), 1);
    assert.equal(await count("game_results"), 1);

    const put = await send(
      "PUT",
      `${G}/answers/${TODAY}`,
      { entryId: OTHER },
      admin,
    );
    assert.equal(put.status, 200);
    assert.equal(await count("user_guesses"), 0);
    assert.equal(await count("user_give_ups"), 0);
    assert.equal(await count("game_results"), 0);
    const graded = await send("POST", `${G}/grade`, { ids: [OTHER] });
    assert.equal(graded.body.revision, 1);
    assert.equal(graded.body.victory, true);
    const state = await send("GET", `${G}/state`, null, player);
    assert.deepEqual(state.body.ids, []);
    assert.equal(state.body.revision, 1);

    // Browser guesses made on the old answer are not adopted on sign-in
    const merged = await send(
      "POST",
      `${G}/state/merge`,
      { day: 427, revision: 0, ids: [OTHER] },
      player,
    );
    assert.equal(merged.status, 409);
    assert.equal(merged.body.error, "stale_day");
    const current = await send(
      "POST",
      `${G}/state/merge`,
      { day: 427, revision: 1, ids: [BELA] },
      player,
    );
    assert.equal(current.status, 200);
  });
});
