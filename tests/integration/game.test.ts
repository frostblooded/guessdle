import assert from "node:assert/strict";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, beforeEach, describe, it } from "node:test";
import { GUESS_DATA } from "../../src/game/roster.ts";
import { createApp } from "../../src/server/app.ts";
import { MIGRATIONS_DIR } from "../../src/server/main.ts";
import { migrate } from "../../src/server/migrate.ts";
import { startDb } from "./postgres.ts";
import type { TestDb } from "./postgres.ts";

// 2026-10-16 is Day Number 427; the backfill stores "bela" for it
const NOW = new Date("2026-10-16T10:00:00Z");
const ANSWER = "bela";
const OTHERS = GUESS_DATA.map((pet) => pet.id).filter((id) => id !== ANSWER);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Body = any;

describe("signed-in Game State on the server", () => {
  let db: TestDb;
  let server: Server;
  let url: string;
  let clock: Date;

  const post = (
    path: string,
    cookie: string,
    body: unknown = {},
  ): Promise<{ status: number; body: Body }> =>
    send(path, { method: "POST", body: JSON.stringify(body) }, cookie);
  const get = (
    path: string,
    cookie: string,
  ): Promise<{ status: number; body: Body }> => send(path, {}, cookie);
  const send = async (
    path: string,
    init: RequestInit,
    cookie: string,
  ): Promise<{ status: number; body: Body }> => {
    const res = await fetch(`${url}${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", Cookie: cookie },
    });
    return { status: res.status, body: await res.json() };
  };
  // One call is one device: a fresh session cookie for the same account
  const login = async (email: string): Promise<string> => {
    const res = await fetch(`${url}/api/test/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    return res.headers.get("set-cookie")!.split(";")[0]!;
  };
  const setAnswer = (date: string, id: string): Promise<unknown> =>
    db.pool.query("update daily_answers set pet_id = $2 where day = $1", [
      date,
      id,
    ]);

  before(async () => {
    db = await startDb();
    await migrate(db.pool, MIGRATIONS_DIR);
    clock = NOW;
    server = await new Promise<Server>((resolve) => {
      const s = createApp({
        pool: db.pool,
        now: () => clock,
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
    await setAnswer("2026-10-16", ANSWER);
    await db.pool.query("delete from daily_answers where day > '2026-10-16'");
    clock = NOW;
  });

  describe("fetch today", () => {
    it("is empty for a new player, with the day number and no answer", async () => {
      const cookie = await login("a@x.test");
      const { status, body } = await get("/api/game", cookie);
      assert.equal(status, 200);
      assert.deepEqual(body, {
        day: 427,
        ids: [],
        rows: [],
        victory: false,
        gaveUp: false,
      });
    });

    it("requires a session", async () => {
      const res = await fetch(`${url}/api/game`);
      assert.equal(res.status, 401);
      assert.deepEqual(await res.json(), { error: "unauthorized" });
      for (const path of ["guess", "give-up", "reset"]) {
        const r = await fetch(`${url}/api/game/${path}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{}",
        });
        assert.equal(r.status, 401, path);
      }
    });

    it("is not cached", async () => {
      const res = await fetch(`${url}/api/game`, {
        headers: { Cookie: await login("a@x.test") },
      });
      assert.equal(res.headers.get("cache-control"), "no-store");
    });
  });

  describe("guess", () => {
    it("grades, persists and returns every row oldest first", async () => {
      const cookie = await login("a@x.test");
      const first = await post("/api/game/guess", cookie, { id: OTHERS[0] });
      assert.equal(first.status, 200);
      assert.deepEqual(first.body.ids, [OTHERS[0]]);
      assert.equal(first.body.rows.length, 1);
      assert.equal(first.body.victory, false);
      assert.equal(first.body.answer, undefined);
      const second = await post("/api/game/guess", cookie, { id: OTHERS[1] });
      assert.deepEqual(second.body.ids, [OTHERS[0], OTHERS[1]]);

      const today = await get("/api/game", cookie);
      assert.deepEqual(today.body, second.body);
    });

    it("never leaks the answer name or id before the game is over", async () => {
      const cookie = await login("a@x.test");
      const { body } = await post("/api/game/guess", cookie, {
        id: OTHERS[0],
      });
      const answer = GUESS_DATA.find((pet) => pet.id === ANSWER)!;
      assert.equal(JSON.stringify(body).includes(`"${answer.name}"`), false);
    });

    it("continues the same game on another device", async () => {
      const phone = await login("a@x.test");
      const laptop = await login("a@x.test");
      assert.notEqual(phone, laptop);
      await post("/api/game/guess", phone, { id: OTHERS[0] });
      const { body } = await get("/api/game", laptop);
      assert.deepEqual(body.ids, [OTHERS[0]]);
      const next = await post("/api/game/guess", laptop, { id: OTHERS[1] });
      assert.deepEqual(next.body.ids, [OTHERS[0], OTHERS[1]]);
    });

    it("keeps each player's game separate", async () => {
      const ann = await login("a@x.test");
      const bob = await login("b@x.test");
      await post("/api/game/guess", ann, { id: OTHERS[0] });
      assert.deepEqual((await get("/api/game", bob)).body.ids, []);
    });

    it("wins on the right guess and reveals the answer", async () => {
      const cookie = await login("a@x.test");
      await post("/api/game/guess", cookie, { id: OTHERS[0] });
      const { status, body } = await post("/api/game/guess", cookie, {
        id: ANSWER,
      });
      assert.equal(status, 200);
      assert.equal(body.victory, true);
      assert.equal(body.answer, GUESS_DATA.find((p) => p.id === ANSWER)!.name);
      const today = await get("/api/game", cookie);
      assert.equal(today.body.victory, true);
      assert.equal(today.body.answer, body.answer);
    });

    it("rejects guesses after winning until reset", async () => {
      const cookie = await login("a@x.test");
      await post("/api/game/guess", cookie, { id: ANSWER });
      const { status, body } = await post("/api/game/guess", cookie, {
        id: OTHERS[0],
      });
      assert.equal(status, 409);
      assert.equal(body.error, "finished");
      assert.equal(body.day, 427);
      assert.deepEqual((await get("/api/game", cookie)).body.ids, [ANSWER]);
    });

    it("rejects a duplicate with 409 and stores it once", async () => {
      const cookie = await login("a@x.test");
      await post("/api/game/guess", cookie, { id: OTHERS[0] });
      const { status, body } = await post("/api/game/guess", cookie, {
        id: OTHERS[0],
      });
      assert.equal(status, 409);
      assert.equal(body.error, "duplicate");
      assert.deepEqual((await get("/api/game", cookie)).body.ids, [OTHERS[0]]);
    });

    for (const [label, payload] of [
      ["an unknown id", { id: "no-such-pet" }],
      ["a missing id", {}],
      ["a number", { id: 7 }],
      ["null", { id: null }],
      ["an array", { id: [ANSWER] }],
      ["an empty string", { id: "" }],
    ] as const) {
      it(`rejects ${label} with 400 and stores nothing`, async () => {
        const cookie = await login("a@x.test");
        const { status, body } = await post("/api/game/guess", cookie, payload);
        assert.equal(status, 400);
        assert.equal(body.error, "invalid");
        assert.deepEqual((await get("/api/game", cookie)).body.ids, []);
      });
    }

    it("rejects a guess after giving up", async () => {
      const cookie = await login("a@x.test");
      await post("/api/game/give-up", cookie);
      const { status, body } = await post("/api/game/guess", cookie, {
        id: OTHERS[0],
      });
      assert.equal(status, 409);
      assert.equal(body.error, "finished");
    });

    it("lets concurrent identical guesses store one", async () => {
      const cookie = await login("a@x.test");
      const results = await Promise.all(
        Array.from({ length: 5 }, () =>
          post("/api/game/guess", cookie, { id: OTHERS[0] }),
        ),
      );
      assert.equal(results.filter((r) => r.status === 200).length, 1);
      assert.equal(results.filter((r) => r.status === 409).length, 4);
      assert.deepEqual((await get("/api/game", cookie)).body.ids, [OTHERS[0]]);
    });
  });

  describe("give up", () => {
    it("stores the finished state and reveals the answer", async () => {
      const cookie = await login("a@x.test");
      await post("/api/game/guess", cookie, { id: OTHERS[0] });
      const { status, body } = await post("/api/game/give-up", cookie);
      assert.equal(status, 200);
      assert.equal(body.gaveUp, true);
      assert.equal(body.victory, false);
      assert.equal(body.answer, GUESS_DATA.find((p) => p.id === ANSWER)!.name);

      const today = await get("/api/game", await login("a@x.test"));
      assert.equal(today.body.gaveUp, true);
      assert.equal(today.body.answer, body.answer);
      assert.deepEqual(today.body.ids, [OTHERS[0]]);
    });

    it("works with no guesses", async () => {
      const cookie = await login("a@x.test");
      assert.equal((await post("/api/game/give-up", cookie)).status, 200);
    });

    it("is refused once the game is finished", async () => {
      const cookie = await login("a@x.test");
      await post("/api/game/give-up", cookie);
      const again = await post("/api/game/give-up", cookie);
      assert.equal(again.status, 409);
      assert.equal(again.body.error, "finished");
      await post("/api/game/reset", cookie);
      await post("/api/game/guess", cookie, { id: ANSWER });
      const afterWin = await post("/api/game/give-up", cookie);
      assert.equal(afterWin.status, 409);
    });
  });

  describe("reset", () => {
    it("after a win deletes the day's guesses so play restarts", async () => {
      const cookie = await login("a@x.test");
      await post("/api/game/guess", cookie, { id: ANSWER });
      const { status, body } = await post("/api/game/reset", cookie);
      assert.equal(status, 200);
      assert.deepEqual(body, {
        day: 427,
        ids: [],
        rows: [],
        victory: false,
        gaveUp: false,
      });
      const next = await post("/api/game/guess", cookie, { id: OTHERS[0] });
      assert.equal(next.status, 200);
    });

    it("after giving up clears the give-up too, across devices", async () => {
      const phone = await login("a@x.test");
      await post("/api/game/give-up", phone);
      await post("/api/game/reset", phone);
      const { body } = await get("/api/game", await login("a@x.test"));
      assert.equal(body.gaveUp, false);
      assert.equal(body.answer, undefined);
    });

    it("is refused while the game is still going, keeping the guesses", async () => {
      const cookie = await login("a@x.test");
      await post("/api/game/guess", cookie, { id: OTHERS[0] });
      const { status, body } = await post("/api/game/reset", cookie);
      assert.equal(status, 409);
      assert.equal(body.error, "not_finished");
      assert.deepEqual((await get("/api/game", cookie)).body.ids, [OTHERS[0]]);
    });

    it("only touches the caller's rows", async () => {
      const ann = await login("a@x.test");
      const bob = await login("b@x.test");
      await post("/api/game/guess", ann, { id: ANSWER });
      await post("/api/game/guess", bob, { id: ANSWER });
      await post("/api/game/reset", ann);
      assert.deepEqual((await get("/api/game", bob)).body.ids, [ANSWER]);
    });
  });

  describe("derived victory and the day", () => {
    it("changing today's stored answer changes victory with no migration", async () => {
      const cookie = await login("a@x.test");
      await post("/api/game/guess", cookie, { id: OTHERS[0] });
      assert.equal((await get("/api/game", cookie)).body.victory, false);

      await setAnswer("2026-10-16", OTHERS[0]!);
      const won = await get("/api/game", cookie);
      assert.equal(won.body.victory, true);
      assert.equal(
        won.body.answer,
        GUESS_DATA.find((p) => p.id === OTHERS[0])!.name,
      );
      const refused = await post("/api/game/guess", cookie, { id: OTHERS[1] });
      assert.equal(refused.status, 409);

      await setAnswer("2026-10-16", ANSWER);
      assert.equal((await get("/api/game", cookie)).body.victory, false);
    });

    it("a guess made earlier counts as a win if the answer is overridden to it", async () => {
      const cookie = await login("a@x.test");
      await post("/api/game/guess", cookie, { id: OTHERS[0] });
      await post("/api/game/guess", cookie, { id: OTHERS[1] });
      await setAnswer("2026-10-16", OTHERS[1]!);
      assert.equal((await get("/api/game", cookie)).body.victory, true);
    });

    it("starts a new day empty, at the next day number", async () => {
      const cookie = await login("a@x.test");
      await post("/api/game/guess", cookie, { id: ANSWER });
      clock = new Date("2026-10-17T10:00:00Z");
      const { body } = await get("/api/game", cookie);
      assert.equal(body.day, 428);
      assert.deepEqual(body.ids, []);
      assert.equal(body.victory, false);
    });

    it("keeps a finished game's reset scoped to the current day", async () => {
      const cookie = await login("a@x.test");
      await post("/api/game/give-up", cookie);
      clock = new Date("2026-10-17T10:00:00Z");
      assert.equal((await post("/api/game/reset", cookie)).status, 409);
      clock = NOW;
      assert.equal((await get("/api/game", cookie)).body.gaveUp, true);
    });
  });

  describe("a stored answer that is not in the roster", () => {
    it("is a JSON 500 for the day's calls", async () => {
      const cookie = await login("a@x.test");
      await setAnswer("2026-10-16", "deleted-pet");
      for (const res of [
        await get("/api/game", cookie),
        await post("/api/game/guess", cookie, { id: OTHERS[0] }),
        await post("/api/game/give-up", cookie),
      ]) {
        assert.equal(res.status, 500);
        assert.equal(res.body.error, "answer_missing");
      }
    });
  });

  describe("request shape", () => {
    it("rejects a non-JSON mutating request", async () => {
      const cookie = await login("a@x.test");
      const res = await fetch(`${url}/api/game/guess`, {
        method: "POST",
        headers: { "Content-Type": "text/plain", Cookie: cookie },
        body: "{}",
      });
      assert.equal(res.status, 415);
    });

    it("rejects an oversized body as invalid", async () => {
      const cookie = await login("a@x.test");
      const { status, body } = await post("/api/game/guess", cookie, {
        id: "x".repeat(20_000),
      });
      assert.equal(status, 413);
      assert.equal(body.error, "invalid");
    });

    it("rejects malformed JSON as invalid", async () => {
      const cookie = await login("a@x.test");
      const res = await fetch(`${url}/api/game/guess`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: cookie },
        body: "{nope",
      });
      assert.equal(res.status, 400);
    });
  });

  describe("merge", () => {
    const merge = (cookie: string, body: unknown) =>
      post("/api/game/merge", cookie, body);

    it("requires a session", async () => {
      const res = await fetch(`${url}/api/game/merge`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ day: 427, ids: [] }),
      });
      assert.equal(res.status, 401);
    });

    it("adopts local guesses in order when the account has no rows", async () => {
      const cookie = await login("a@x.test");
      const ids = [OTHERS[2], OTHERS[0], OTHERS[1]];
      const { status, body } = await merge(cookie, { day: 427, ids });
      assert.equal(status, 200);
      assert.deepEqual(body.ids, ids);
      assert.equal(body.rows.length, 3);
      assert.equal(body.victory, false);
      assert.equal(body.gaveUp, false);
      assert.equal(body.answer, undefined);
      assert.deepEqual((await get("/api/game", cookie)).body, body);
    });

    it("adopts a give-up and reveals the answer", async () => {
      const cookie = await login("a@x.test");
      const { body } = await merge(cookie, {
        day: 427,
        ids: [OTHERS[0]],
        gaveUp: true,
      });
      assert.equal(body.gaveUp, true);
      assert.equal(typeof body.answer, "string");
      assert.deepEqual(body.ids, [OTHERS[0]]);
    });

    it("adopts a give-up with no guesses", async () => {
      const cookie = await login("a@x.test");
      const { status, body } = await merge(cookie, {
        day: 427,
        ids: [],
        gaveUp: true,
      });
      assert.equal(status, 200);
      assert.equal(body.gaveUp, true);
    });

    it("answers 409 and keeps the server state when the account has guesses", async () => {
      const cookie = await login("a@x.test");
      await post("/api/game/guess", cookie, { id: OTHERS[0] });
      const { status, body } = await merge(cookie, {
        day: 427,
        ids: [OTHERS[1], OTHERS[2]],
      });
      assert.equal(status, 409);
      assert.equal(body.error, "has_progress");
      assert.deepEqual((await get("/api/game", cookie)).body.ids, [OTHERS[0]]);
    });

    it("answers 409 when the account only has a give-up", async () => {
      const cookie = await login("a@x.test");
      await post("/api/game/give-up", cookie);
      const { status } = await merge(cookie, { day: 427, ids: [OTHERS[0]] });
      assert.equal(status, 409);
      assert.deepEqual((await get("/api/game", cookie)).body.ids, []);
    });

    it("cannot re-adopt the same local history", async () => {
      const cookie = await login("a@x.test");
      const payload = { day: 427, ids: [OTHERS[0], OTHERS[1]] };
      assert.equal((await merge(cookie, payload)).status, 200);
      assert.equal((await merge(cookie, payload)).status, 409);
      assert.equal((await merge(await login("a@x.test"), payload)).status, 409);
      assert.deepEqual((await get("/api/game", cookie)).body.ids, payload.ids);
    });

    it("lets exactly one of concurrent merges win", async () => {
      const cookie = await login("a@x.test");
      const results = await Promise.all(
        [OTHERS[0], OTHERS[1], OTHERS[2], OTHERS[3]].map((id) =>
          merge(cookie, { day: 427, ids: [id] }),
        ),
      );
      assert.equal(results.filter((r) => r.status === 200).length, 1);
      assert.equal(results.filter((r) => r.status === 409).length, 3);
      assert.equal((await get("/api/game", cookie)).body.ids.length, 1);
    });

    it("rejects a stale or missing day and stores nothing", async () => {
      const cookie = await login("a@x.test");
      for (const day of [426, 428, "427", null, undefined]) {
        const { status, body } = await merge(cookie, {
          day,
          ids: [OTHERS[0]],
        });
        assert.equal(status, 409, String(day));
        assert.equal(body.error, "stale_day");
        assert.equal(body.day, 427);
      }
      assert.deepEqual((await get("/api/game", cookie)).body.ids, []);
    });

    it("rejects ids outside the roster and stores nothing", async () => {
      const cookie = await login("a@x.test");
      const { status, body } = await merge(cookie, {
        day: 427,
        ids: [OTHERS[0], "not-a-pet"],
      });
      assert.equal(status, 400);
      assert.equal(body.error, "invalid");
      assert.deepEqual((await get("/api/game", cookie)).body.ids, []);
    });

    it("rejects malformed payloads", async () => {
      const cookie = await login("a@x.test");
      for (const bad of [
        { day: 427 },
        { day: 427, ids: "x" },
        { day: 427, ids: [1] },
        { day: 427, ids: [], gaveUp: "yes" },
        { day: 427, ids: [...GUESS_DATA.map((p) => p.id), OTHERS[0]] },
      ]) {
        const { status, body } = await merge(cookie, bad);
        assert.equal(status, 400, JSON.stringify(bad).slice(0, 40));
        assert.equal(body.error, "invalid");
      }
    });

    it("drops duplicates, keeping first occurrence order", async () => {
      const cookie = await login("a@x.test");
      const { status, body } = await merge(cookie, {
        day: 427,
        ids: [OTHERS[1], OTHERS[0], OTHERS[1], OTHERS[0], OTHERS[2]],
      });
      assert.equal(status, 200);
      assert.deepEqual(body.ids, [OTHERS[1], OTHERS[0], OTHERS[2]]);
    });

    it("ignores guesses after the answer and reveals the win", async () => {
      const cookie = await login("a@x.test");
      const { status, body } = await merge(cookie, {
        day: 427,
        ids: [OTHERS[0], ANSWER, OTHERS[1]],
        gaveUp: true,
      });
      assert.equal(status, 200);
      assert.deepEqual(body.ids, [OTHERS[0], ANSWER]);
      assert.equal(body.victory, true);
      assert.equal(body.gaveUp, false);
      assert.equal(typeof body.answer, "string");
      const more = await post("/api/game/guess", cookie, { id: OTHERS[1] });
      assert.equal(more.body.error, "finished");
    });

    it("an empty merge stores nothing and leaves the account free to merge", async () => {
      const cookie = await login("a@x.test");
      const empty = await merge(cookie, { day: 427, ids: [] });
      assert.equal(empty.status, 200);
      assert.deepEqual(empty.body.ids, []);
      assert.equal(
        (await merge(cookie, { day: 427, ids: [OTHERS[0]] })).status,
        200,
      );
    });

    it("keeps accounts apart", async () => {
      const a = await login("a@x.test");
      const b = await login("b@x.test");
      await merge(a, { day: 427, ids: [OTHERS[0]] });
      assert.equal(
        (await merge(b, { day: 427, ids: [OTHERS[1]] })).status,
        200,
      );
      assert.deepEqual((await get("/api/game", a)).body.ids, [OTHERS[0]]);
    });

    it("rejects a non-JSON merge", async () => {
      const cookie = await login("a@x.test");
      const res = await fetch(`${url}/api/game/merge`, {
        method: "POST",
        headers: { "Content-Type": "text/plain", Cookie: cookie },
        body: "{}",
      });
      assert.equal(res.status, 415);
    });
  });
});
