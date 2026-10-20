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

  it("counts a signed-in player by their stored guesses and their times, not the body", async () => {
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
    assert.deepEqual(body.you, { guesses: 2, seconds: 0 });
    const { rows } = await db.pool.query<{ player: string }>(
      "select player from game_results",
    );
    assert.match(rows[0]!.player, /^user:\d+$/);
  });

  describe("a signed-in win's time", () => {
    it("is timed by the server, whatever the browser sends", async () => {
      const cookie = await login("a@x.test");
      await post(`${G}/state/guess`, { id: OTHERS[0] }, cookie);
      await post(`${G}/state/guess`, { id: ANSWER }, cookie);
      // The first guess was made 95 seconds before the winning one
      await db.pool.query(
        "update user_guesses set guessed_at = guessed_at - interval '95 seconds' where entry_id = $1",
        [OTHERS[0]],
      );
      // Another device opens See stats: it never saw the first guess
      const { body } = await post(`${G}/result`, { seconds: null }, cookie);
      assert.deepEqual(body.you, { guesses: 2, seconds: 95 });
      assert.deepEqual(body.board, { guesses: 2, seconds: 95 });
      assert.equal(body.times[2], 1);
    });

    it("shows the board's own time on a replay", async () => {
      const cookie = await login("a@x.test");
      await post(`${G}/state/guess`, { id: ANSWER }, cookie);
      await post(`${G}/result`, {}, cookie);
      await post(`${G}/state/reset`, {}, cookie);
      await post(`${G}/state/guess`, { id: OTHERS[0] }, cookie);
      await post(`${G}/state/guess`, { id: ANSWER }, cookie);
      const { body } = await post(`${G}/result`, {}, cookie);
      assert.deepEqual(body.you, { guesses: 1, seconds: 0 });
      assert.deepEqual(body.board, { guesses: 2, seconds: 0 });
    });

    it("uses the browser's time for guesses moved in at sign-in", async () => {
      const cookie = await login("a@x.test");
      const merged = await post(
        `${G}/state/merge`,
        { day: 427, revision: 0, ids: [OTHERS[0], ANSWER], gaveUp: false },
        cookie,
      );
      assert.equal(merged.status, 200);
      const { body } = await post(`${G}/result`, { seconds: 40 }, cookie);
      assert.deepEqual(body.you, { guesses: 2, seconds: 40 });
      assert.deepEqual(body.board, { guesses: 2, seconds: 40 });
    });
  });

  describe("a guest who signs in", () => {
    const winSignedIn = async (cookie: string): Promise<void> => {
      await post(`${G}/state/guess`, { id: ANSWER }, cookie);
    };

    it("counts once: the guest win is dropped, the account's counts", async () => {
      await post(`${G}/result`, {
        ids: [OTHERS[0], ANSWER],
        seconds: 40,
        player: TOKEN_A,
      });
      const cookie = await login("a@x.test");
      await winSignedIn(cookie);
      const { body } = await post(
        `${G}/result`,
        { seconds: 3, player: TOKEN_A },
        cookie,
      );
      assert.deepEqual(body.you, { guesses: 1, seconds: 0 });
      assert.equal(body.players, 1);
      assert.equal(
        body.guesses.reduce((a: number, b: number) => a + b),
        1,
      );
      assert.equal(
        body.times.reduce((a: number, b: number) => a + b),
        1,
      );
      const { rows } = await db.pool.query<{ player: string }>(
        "select player from game_results",
      );
      assert.equal(rows.length, 1);
      assert.match(rows[0]!.player, /^user:\d+$/);
    });

    it("keeps the account's own win over the guest one", async () => {
      const cookie = await login("a@x.test");
      await winSignedIn(cookie);
      await post(`${G}/result`, { seconds: 7 }, cookie);
      await post(`${G}/result`, {
        ids: [OTHERS[0], OTHERS[1], ANSWER],
        seconds: 50,
        player: TOKEN_A,
      });
      const { body } = await post(`${G}/result`, { player: TOKEN_A }, cookie);
      assert.deepEqual(body.you, { guesses: 1, seconds: 0 });
      assert.equal(body.players, 1);
    });

    it("ignores a guest give-up", async () => {
      await post(`${G}/give-up`, { player: TOKEN_A });
      const cookie = await login("a@x.test");
      await winSignedIn(cookie);
      const { body } = await post(
        `${G}/result`,
        { seconds: 3, player: TOKEN_A },
        cookie,
      );
      assert.deepEqual(body.you, { guesses: 1, seconds: 0 });
      assert.equal(body.firstTryFailed, undefined);
    });

    it("leaves other browsers' guest wins alone", async () => {
      await post(`${G}/result`, { ids: [ANSWER], player: TOKEN_B });
      const cookie = await login("a@x.test");
      await winSignedIn(cookie);
      const { body } = await post(`${G}/result`, { player: TOKEN_A }, cookie);
      assert.equal(body.players, 2);
    });
  });

  describe("a first attempt that failed", () => {
    it("an anonymous give-up keeps a win after a reset out of the stats", async () => {
      const gave = await post(`${G}/give-up`, { player: TOKEN_A });
      assert.equal(gave.status, 200);
      const { status, body } = await post(`${G}/result`, {
        ids: [ANSWER],
        seconds: 5,
        player: TOKEN_A,
      });
      assert.equal(status, 200);
      assert.equal(body.you, null);
      assert.equal(body.firstTryFailed, true);
      assert.equal(body.players, 0);
      assert.equal(body.guesses[0], 0);
    });

    it("a give-up after a counted win changes nothing", async () => {
      await post(`${G}/result`, { ids: [ANSWER], seconds: 5, player: TOKEN_A });
      await post(`${G}/give-up`, { player: TOKEN_A });
      const { body } = await post(`${G}/result`, {
        ids: [ANSWER],
        player: TOKEN_A,
      });
      assert.deepEqual(body.you, { guesses: 1, seconds: 5 });
      assert.equal(body.firstTryFailed, undefined);
    });

    it("leaves failed players out of everyone else's stats", async () => {
      await post(`${G}/give-up`, { player: TOKEN_B });
      const { body } = await post(`${G}/result`, {
        ids: [OTHERS[0], ANSWER],
        seconds: 20,
        player: TOKEN_A,
      });
      assert.equal(body.players, 1);
      assert.equal(body.fewerGuessesThan, null);
    });

    it("a give-up with no token records nothing", async () => {
      await post(`${G}/give-up`, {});
      const { rows } = await db.pool.query("select 1 from game_results");
      assert.equal(rows.length, 0);
    });

    it("a signed-in give-up, reset and win is not counted", async () => {
      const cookie = await login("a@x.test");
      await post(`${G}/state/guess`, { id: OTHERS[0] }, cookie);
      await post(`${G}/state/give-up`, {}, cookie);
      await post(`${G}/state/reset`, {}, cookie);
      await post(`${G}/state/guess`, { id: ANSWER }, cookie);
      const { status, body } = await post(
        `${G}/result`,
        { seconds: 3 },
        cookie,
      );
      assert.equal(status, 200);
      assert.equal(body.you, null);
      assert.equal(body.firstTryFailed, true);
    });

    it("a past day's give-up only blocks that day", async () => {
      // 2026-10-15, Day Number 426: the backfill stores "ati"
      await post(`${G}/give-up?day=426`, { player: TOKEN_A });
      const past = await post(`${G}/result?day=426`, {
        ids: [pid("ati")],
        player: TOKEN_A,
      });
      assert.equal(past.body.firstTryFailed, true);
      const today = await post(`${G}/result`, {
        ids: [ANSWER],
        player: TOKEN_A,
      });
      assert.deepEqual(today.body.you, { guesses: 1, seconds: null });
    });

    describe("in a Blur game", () => {
      beforeAll(async () => {
        await db.pool.query(
          "update games set kind = 'blur', blur_tries = 2 where slug = $1",
          [GAME],
        );
        // A Blur entry needs a photo and a clearing order to be playable
        await db.pool.query(
          "update entries set blur_order = '{0,1,2,3,4,5,6,7,8}', photo_url = '/uploads/x.webp' where game_id = (select id from games where slug = $1)",
          [GAME],
        );
      });
      afterAll(async () => {
        await db.pool.query(
          "update games set kind = 'classic', blur_tries = 9 where slug = $1",
          [GAME],
        );
        await db.pool.query(
          "update entries set blur_order = null, photo_url = '' where game_id = (select id from games where slug = $1)",
          [GAME],
        );
      });

      it("running out of tries anonymously keeps a later win out", async () => {
        const lost = await post(`${G}/grade`, {
          ids: [OTHERS[0], OTHERS[1]],
          player: TOKEN_A,
        });
        assert.equal(lost.body.lost, true);
        const { body } = await post(`${G}/result`, {
          ids: [ANSWER],
          player: TOKEN_A,
        });
        assert.equal(body.firstTryFailed, true);
      });

      it("running out of tries signed in keeps a later win out", async () => {
        const cookie = await login("a@x.test");
        await post(`${G}/state/guess`, { id: OTHERS[0] }, cookie);
        const last = await post(`${G}/state/guess`, { id: OTHERS[1] }, cookie);
        assert.equal(last.body.lost, true);
        await post(`${G}/state/reset`, {}, cookie);
        await post(`${G}/state/guess`, { id: ANSWER }, cookie);
        const { body } = await post(`${G}/result`, {}, cookie);
        assert.equal(body.firstTryFailed, true);
        assert.equal(body.you, null);
      });

      it("a win within the tries still counts", async () => {
        const { body } = await post(`${G}/result`, {
          ids: [OTHERS[0], ANSWER],
          player: TOKEN_A,
        });
        assert.deepEqual(body.you, { guesses: 2, seconds: null });
      });
    });
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
      assert.deepEqual(body.you, { guesses: 1, seconds: 0 });
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
