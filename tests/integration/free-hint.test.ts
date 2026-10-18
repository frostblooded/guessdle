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
const WRONG = PET_IDS.filter((id) => id !== ANSWER).slice(0, 3);
const G = `/api/games/${GAME}`;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Body = any;

describe("Free Hints and entry descriptions", () => {
  let db: TestDb;
  let server: Server;
  let url: string;

  const send = async (
    path: string,
    body?: unknown,
    cookie = "",
  ): Promise<{ status: number; body: Body }> => {
    const res = await fetch(`${url}${path}`, {
      ...(body !== undefined && {
        method: "POST",
        body: JSON.stringify(body),
      }),
      headers: { "Content-Type": "application/json", Cookie: cookie },
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
  const describeAnswer = (text: string): Promise<unknown> =>
    db.pool.query("update entries set description = $2 where id = $1", [
      ANSWER,
      text,
    ]);
  // The attribute names no row matched (column 0 is the name)
  const unmatched = (rows: Body[][]): string[] =>
    rows[0]!
      .slice(1)
      .map((cell: Body) => cell.key as string)
      .filter(
        (key: string) =>
          !rows.some((row) =>
            row.some((c: Body) => c.key === key && c.correctness === 2),
          ),
      );

  beforeAll(async () => {
    db = await startDb();
    await migrate(db.pool, MIGRATIONS_DIR);
    server = await new Promise<Server>((resolve) => {
      const s = createApp({
        pool: db.pool,
        now: () => NOW,
        random: () => 0,
        testLogin: true,
      }).listen(0, "127.0.0.1", () => resolve(s));
    });
    url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    await send(`${G}/days`);
  });
  afterAll(async () => {
    server.close();
    await db.stop();
  });
  beforeEach(async () => {
    await db.pool.query("delete from users");
    await db.pool.query("update entries set description = ''");
    await db.pool.query(
      "update daily_answers set entry_id = $1 where day = '2026-10-16'",
      [ANSWER],
    );
  });

  describe("anonymous", () => {
    it("offers a hint only after 3 wrong guesses", async () => {
      const two = await send(`${G}/grade`, { ids: WRONG.slice(0, 2) });
      assert.equal(two.body.hints, undefined);
      const three = await send(`${G}/grade`, { ids: WRONG });
      assert.deepEqual(three.body.hints, {
        attribute: unmatched(three.body.rows).length > 0,
        description: false,
      });
      const won = await send(`${G}/grade`, { ids: [...WRONG, ANSWER] });
      assert.equal(won.body.hints, undefined);
    });

    it("reveals an unmatched attribute of the answer", async () => {
      const { body: graded } = await send(`${G}/grade`, { ids: WRONG });
      const { status, body } = await send(`${G}/hint`, {
        ids: WRONG,
        kind: "attribute",
      });
      assert.equal(status, 200);
      assert.equal(body.day, 427);
      assert.equal(body.hint.kind, "attribute");
      assert.equal(body.hint.attribute, unmatched(graded.rows)[0]);
      const won = await send(`${G}/grade`, { ids: [ANSWER] });
      const cell = won.body.rows[0].find(
        (c: Body) => c.key === body.hint.attribute,
      );
      assert.deepEqual(body.hint.value, cell.value);
    });

    it("reveals the description, offered only when the answer has one", async () => {
      const refused = await send(`${G}/hint`, {
        ids: WRONG,
        kind: "description",
      });
      assert.equal(refused.status, 409);
      assert.equal(refused.body.error, "no_hint");
      await describeAnswer("Bela naps in the sun.");
      const graded = await send(`${G}/grade`, { ids: WRONG });
      assert.equal(graded.body.hints.description, true);
      const { body } = await send(`${G}/hint`, {
        ids: WRONG,
        kind: "description",
      });
      assert.deepEqual(body.hint, {
        kind: "description",
        description: "Bela naps in the sun.",
      });
    });

    it("refuses too few guesses, a won board and a bad kind", async () => {
      for (const [ids, kind, status] of [
        [WRONG.slice(0, 2), "attribute", 409],
        [[...WRONG, ANSWER], "attribute", 409],
        [WRONG, "name", 400],
      ] as const) {
        const res = await send(`${G}/hint`, { ids, kind });
        assert.equal(res.status, status, String(kind));
      }
    });

    it("shows the description with the answer once the day is over", async () => {
      await describeAnswer("Bela naps in the sun.");
      const playing = await send(`${G}/grade`, { ids: WRONG });
      assert.equal(playing.body.answerDescription, undefined);
      const won = await send(`${G}/grade`, { ids: [ANSWER] });
      assert.equal(won.body.answerDescription, "Bela naps in the sun.");
      const gaveUp = await send(`${G}/give-up`, {});
      assert.equal(gaveUp.body.answerDescription, "Bela naps in the sun.");
    });
  });

  describe("signed in", () => {
    const guessAll = async (cookie: string): Promise<Body> => {
      let last: Body;
      for (const id of WRONG) {
        last = (await send(`${G}/state/guess`, { id }, cookie)).body;
      }
      return last;
    };

    it("offers, stores and shows one hint per day", async () => {
      const cookie = await login("a@x.test");
      await describeAnswer("Bela naps in the sun.");
      const before = await guessAll(cookie);
      assert.deepEqual(before.hints, {
        attribute: unmatched(before.rows).length > 0,
        description: true,
      });
      const used = await send(
        `${G}/state/hint`,
        { kind: "description" },
        cookie,
      );
      assert.equal(used.status, 200);
      assert.deepEqual(used.body.hint, {
        kind: "description",
        description: "Bela naps in the sun.",
      });
      assert.equal(used.body.hints, undefined);
      const again = await send(
        `${G}/state/hint`,
        { kind: "attribute" },
        cookie,
      );
      assert.equal(again.status, 409);
      assert.equal(again.body.error, "no_hint");
      // Another device sees the same hint
      const other = await login("a@x.test");
      const state = await send(`${G}/state`, undefined, other);
      assert.equal(state.body.hint.kind, "description");
    });

    it("refuses before 3 guesses and forgets the hint on reset", async () => {
      const cookie = await login("b@x.test");
      const early = await send(
        `${G}/state/hint`,
        { kind: "attribute" },
        cookie,
      );
      assert.equal(early.status, 409);
      await guessAll(cookie);
      const used = await send(`${G}/state/hint`, { kind: "attribute" }, cookie);
      assert.equal(used.body.hint.kind, "attribute");
      const reset = await send(`${G}/state/reset`, {}, cookie);
      assert.equal(reset.body.hint, undefined);
      const replay = await guessAll(cookie);
      assert.equal(replay.hint, undefined);
      assert.equal(replay.hints.attribute, true);
    });
  });
});
