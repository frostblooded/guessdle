import assert from "node:assert/strict";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
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
const OTHERS = PET_IDS.filter((id) => id !== ANSWER);
const G = `/api/games/${GAME}`;
const TOKEN_A = "aaaaaaaa-0000-4000-8000-000000000001";
const TOKEN_B = "bbbbbbbb-0000-4000-8000-000000000002";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Body = any;

describe("victory stats", () => {
  let db: TestDb;
  let server: Server;
  let url: string;

  const post = async (
    path: string,
    body: unknown,
    cookie = "",
  ): Promise<{ status: number; body: Body }> => {
    const res = await fetch(`${url}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify(body),
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
  beforeEach(async () => {
    await db.pool.query("delete from game_results");
    await db.pool.query("delete from users");
  });

  it("records an anonymous win and answers with today's stats", async () => {
    const { status, body } = await post(`${G}/result`, {
      ids: [OTHERS[0], OTHERS[1], ANSWER],
      seconds: 95,
      player: TOKEN_A,
    });
    assert.equal(status, 200);
    assert.equal(body.day, 427);
    assert.deepEqual(body.you, { guesses: 3, seconds: 95 });
    assert.equal(body.players, 1);
    assert.equal(body.guesses[2], 1);
    assert.equal(body.times[2], 1);
    assert.equal(body.fewerGuessesThan, null);
  });

  it("keeps only the first win of the day: a replay changes nothing", async () => {
    await post(`${G}/result`, {
      ids: [OTHERS[0], ANSWER],
      seconds: 40,
      player: TOKEN_A,
    });
    const replay = await post(`${G}/result`, {
      ids: [ANSWER],
      seconds: 2,
      player: TOKEN_A,
    });
    assert.deepEqual(replay.body.you, { guesses: 2, seconds: 40 });
    assert.equal(replay.body.players, 1);
  });

  it("compares the player with the other winners", async () => {
    await post(`${G}/result`, {
      ids: [OTHERS[0], OTHERS[1], OTHERS[2], ANSWER],
      seconds: 300,
      player: TOKEN_B,
    });
    const { body } = await post(`${G}/result`, {
      ids: [OTHERS[0], ANSWER],
      seconds: 30,
      player: TOKEN_A,
    });
    assert.equal(body.players, 2);
    assert.equal(body.fewerGuessesThan, 100);
    assert.equal(body.fasterThan, 100);
  });

  it("refuses a list that does not end with the answer", async () => {
    for (const ids of [[OTHERS[0]], [ANSWER, OTHERS[0]]]) {
      const { status, body } = await post(`${G}/result`, {
        ids,
        seconds: 10,
        player: TOKEN_A,
      });
      assert.equal(status, 409);
      assert.equal(body.error, "not_won");
    }
    const { rows } = await db.pool.query("select 1 from game_results");
    assert.equal(rows.length, 0);
  });

  it("needs a player token when signed out", async () => {
    const { status } = await post(`${G}/result`, {
      ids: [ANSWER],
      seconds: 10,
      player: "x",
    });
    assert.equal(status, 400);
  });

  it("stores no time when it is missing or not believable", async () => {
    const { body } = await post(`${G}/result`, {
      ids: [ANSWER],
      seconds: 999_999,
      player: TOKEN_A,
    });
    assert.deepEqual(body.you, { guesses: 1, seconds: null });
  });

  it("counts a signed-in player by their stored guesses, not the body", async () => {
    const cookie = await login("a@x.test");
    const early = await post(`${G}/result`, { seconds: 10 }, cookie);
    assert.equal(early.status, 409);
    await post(`${G}/state/guess`, { id: OTHERS[0] }, cookie);
    await post(`${G}/state/guess`, { id: ANSWER }, cookie);
    const { status, body } = await post(
      `${G}/result`,
      { ids: [ANSWER], seconds: 20 },
      cookie,
    );
    assert.equal(status, 200);
    assert.deepEqual(body.you, { guesses: 2, seconds: 20 });
    const { rows } = await db.pool.query<{ player: string }>(
      "select player from game_results",
    );
    assert.match(rows[0]!.player, /^user:\d+$/);
  });

  describe("a past day", () => {
    // 2026-10-15, Day Number 426: the backfill stores "ati"
    const PAST_ANSWER = pid("ati");

    it("records its first win in that day's stats, apart from today's", async () => {
      const { status, body } = await post(`${G}/result?day=426`, {
        ids: [ANSWER, PAST_ANSWER],
        seconds: 30,
        player: TOKEN_A,
      });
      assert.equal(status, 200);
      assert.equal(body.day, 426);
      assert.deepEqual(body.you, { guesses: 2, seconds: 30 });
      const replay = await post(`${G}/result?day=426`, {
        ids: [PAST_ANSWER],
        seconds: 5,
        player: TOKEN_A,
      });
      assert.deepEqual(replay.body.you, { guesses: 2, seconds: 30 });
      const today = await post(`${G}/result`, {
        ids: [ANSWER],
        seconds: 9,
        player: TOKEN_B,
      });
      assert.equal(today.body.players, 1);
    });

    it("grades against the past day's answer, not today's", async () => {
      const { status } = await post(`${G}/result?day=426`, {
        ids: [ANSWER],
        player: TOKEN_A,
      });
      assert.equal(status, 409);
    });

    it("uses a signed-in player's guesses stored for that day", async () => {
      const cookie = await login("a@x.test");
      await post(`${G}/state/guess?day=426`, { id: PAST_ANSWER }, cookie);
      const { status, body } = await post(
        `${G}/result?day=426`,
        { seconds: 7 },
        cookie,
      );
      assert.equal(status, 200);
      assert.deepEqual(body.you, { guesses: 1, seconds: 7 });
    });

    it("refuses a day after today", async () => {
      const { status, body } = await post(`${G}/result?day=428`, {
        ids: [ANSWER],
        player: TOKEN_A,
      });
      assert.equal(status, 404);
      assert.equal(body.error, "no_such_day");
    });
  });
});
