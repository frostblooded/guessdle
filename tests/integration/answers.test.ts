import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { join } from "node:path";
import { after, before, beforeEach, describe, it } from "node:test";
import { ANSWER_SKIP_PERIOD, GUESS_DATA } from "../../src/game/roster.ts";
import { dateOfDay, dayNumber } from "../../src/server/answers.ts";
import { createApp } from "../../src/server/app.ts";
import { MIGRATIONS_DIR } from "../../src/server/main.ts";
import { migrate } from "../../src/server/migrate.ts";
import { startDb } from "./postgres.ts";
import type { TestDb } from "./postgres.ts";

const BACKFILL_END = "2026-10-16";
const backfill: Record<string, string> = JSON.parse(
  readFileSync(
    join(import.meta.dirname, "../../db/backfill/answers.json"),
    "utf8",
  ),
);
const ALL_IDS = GUESS_DATA.map((pet) => pet.id);

interface Cell {
  key: string;
  value: unknown;
}

interface Body {
  error?: string;
  day?: number;
  rows?: Cell[][];
  victory?: boolean;
  answer?: string;
}

interface Reply {
  status: number;
  body: Body;
}

describe("stored daily answers and anonymous grading", () => {
  let db: TestDb;
  let server: Server;
  let url: string;
  // 10:00 UTC on this date unless a test sets `clock`; tests move it
  let today = BACKFILL_END;
  let clock: Date | null = null;
  let draws = 0;
  let random: () => number = () => 0;

  const post = async (
    ids: unknown,
    init: { body?: string; type?: string | null } = {},
  ): Promise<Reply> => {
    const headers: Record<string, string> = {};
    if (init.type !== null) {
      headers["Content-Type"] = init.type ?? "application/json";
    }
    const res = await fetch(`${url}/api/grade`, {
      method: "POST",
      headers,
      body: init.body ?? JSON.stringify({ ids }),
    });
    return { status: res.status, body: (await res.json()) as Body };
  };

  // Guessing the whole roster reveals the answer, whatever it is
  const answerOf = async (): Promise<string> => {
    const { body } = await post(ALL_IDS);
    const pet = GUESS_DATA.find((p) => p.name === body.answer);
    assert.ok(pet, "answer revealed");
    return pet.id;
  };

  const storedDays = async (): Promise<{ day: string; pet_id: string }[]> =>
    (
      await db.pool.query(
        "select to_char(day, 'YYYY-MM-DD') as day, pet_id from daily_answers order by day",
      )
    ).rows;

  before(async () => {
    db = await startDb();
    await migrate(db.pool, MIGRATIONS_DIR);
    server = await new Promise<Server>((resolve) => {
      const s = createApp({
        pool: db.pool,
        now: () => clock ?? new Date(`${today}T10:00:00Z`),
        random: () => {
          draws++;
          return random();
        },
      }).listen(0, "127.0.0.1", () => resolve(s));
    });
    url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  after(async () => {
    server.close();
    await db.stop();
  });
  beforeEach(async () => {
    await db.pool.query("delete from daily_answers where day > $1", [
      BACKFILL_END,
    ]);
    today = BACKFILL_END;
    clock = null;
    draws = 0;
    random = () => 0;
  });

  describe("backfill migration", () => {
    it("stores days 0..today exactly as the old replay gave them", async () => {
      const rows = await storedDays();
      assert.equal(rows.length, dayNumber(BACKFILL_END) + 1);
      assert.deepEqual(
        Object.fromEntries(rows.map((r) => [r.day, r.pet_id])),
        backfill,
      );
    });

    it("serves the backfilled answer for today without drawing", async () => {
      assert.equal(await answerOf(), backfill[BACKFILL_END]);
      assert.equal(draws, 0);
    });

    it("keeps existing rows when run again and is not re-applied", async () => {
      await db.pool.query(
        "update daily_answers set pet_id = 'edited', source = 'override' where day = '2025-08-15'",
      );
      assert.deepEqual(await migrate(db.pool, MIGRATIONS_DIR), []);
      const sql = readFileSync(
        join(MIGRATIONS_DIR, "001_daily_answers.sql"),
        "utf8",
      );
      await db.pool.query(sql.slice(sql.indexOf("insert into")));
      const { rows } = await db.pool.query(
        "select pet_id, source from daily_answers where day = '2025-08-15'",
      );
      assert.deepEqual(rows, [{ pet_id: "edited", source: "override" }]);
      assert.equal((await storedDays()).length, dayNumber(BACKFILL_END) + 1);
      await db.pool.query(
        "update daily_answers set pet_id = $1, source = 'generated' where day = '2025-08-15'",
        [backfill["2025-08-15"]],
      );
    });
  });

  describe("first request of a day", () => {
    it("generates and stores the answer, the same one for every later request", async () => {
      today = "2026-10-17";
      random = () => 0.3;
      const answer = await answerOf();
      assert.equal(await answerOf(), answer);
      assert.equal(draws, 1);
      const rows = await storedDays();
      assert.deepEqual(rows.at(-1), { day: "2026-10-17", pet_id: answer });
    });

    it("yields one stored answer for concurrent first requests", async () => {
      today = "2026-10-17";
      let n = 0;
      random = () => (n++ % 7) / 7;
      const answers = await Promise.all(
        Array.from({ length: 15 }, () => answerOf()),
      );
      assert.equal(new Set(answers).size, 1);
      const rows = await storedDays();
      assert.equal(rows.filter((r) => r.day === "2026-10-17").length, 1);
      assert.equal(rows.at(-1)!.pet_id, answers[0]);
      assert.equal(draws, 1);
    });

    it("yields one answer per day for concurrent requests spanning a gap", async () => {
      today = "2026-10-20";
      random = () => Math.random();
      const answers = await Promise.all(
        Array.from({ length: 10 }, () => answerOf()),
      );
      assert.equal(new Set(answers).size, 1);
      assert.equal(draws, 4);
      assert.equal((await storedDays()).length, dayNumber("2026-10-20") + 1);
    });

    it("follows the server time zone midnight, not UTC", async () => {
      // Sofia is UTC+3 until 25 Oct 2026
      clock = new Date(`${BACKFILL_END}T20:59:00Z`);
      assert.equal((await post([])).body.day, dayNumber(BACKFILL_END));
      clock = new Date(`${BACKFILL_END}T21:01:00Z`);
      assert.equal((await post([])).body.day, dayNumber(BACKFILL_END) + 1);
    });
  });

  describe("Skip Period over stored history", () => {
    const assertWindowsHold = async (): Promise<void> => {
      const rows = await storedDays();
      rows.forEach((row, i) => {
        for (let back = 1; back <= ANSWER_SKIP_PERIOD && back <= i; back++) {
          assert.notEqual(row.pet_id, rows[i - back]!.pet_id, row.day);
        }
      });
    };

    it("avoids the last five stored answers when the draw would pick them", async () => {
      today = "2026-10-17";
      random = () => 0; // always the first allowed pet
      const history = (await storedDays()).slice(-ANSWER_SKIP_PERIOD);
      const answer = await answerOf();
      assert.ok(!history.some((row) => row.pet_id === answer));
      await assertWindowsHold();
    });

    it("holds over a long fill that starts inside the backfilled history", async () => {
      today = dateOfDay(dayNumber(BACKFILL_END) + 60);
      random = () => 0;
      await answerOf();
      await assertWindowsHold();
    });

    it("counts overrides as stored answers", async () => {
      const day = dayNumber(BACKFILL_END) + 1;
      // The pet random() = 0 would pick next, stored as an override
      random = () => 0;
      const previous = (await storedDays())
        .slice(-ANSWER_SKIP_PERIOD)
        .map((r) => r.pet_id);
      const wouldPick = ALL_IDS.find((id) => !previous.includes(id))!;
      await db.pool.query(
        "insert into daily_answers (day, pet_id, source) values ($1, $2, 'override')",
        [dateOfDay(day), wouldPick],
      );
      today = dateOfDay(day + 1);
      assert.notEqual(await answerOf(), wouldPick);
      await db.pool.query("delete from daily_answers where day > $1", [
        BACKFILL_END,
      ]);
    });
  });

  describe("filling gaps", () => {
    it("generates every missing day in order, one draw each", async () => {
      today = dateOfDay(dayNumber(BACKFILL_END) + 5);
      let n = 0;
      random = () => [0.1, 0.9, 0.5, 0.2, 0.7][n++]!;
      await post([]);
      const rows = (await storedDays()).slice(dayNumber(BACKFILL_END) + 1);
      assert.deepEqual(
        rows.map((r) => r.day),
        [1, 2, 3, 4, 5].map((i) => dateOfDay(dayNumber(BACKFILL_END) + i)),
      );
      assert.equal(draws, 5);
    });

    it("does not write rows when a request is rejected", async () => {
      today = "2026-10-25";
      await post("nope");
      assert.equal((await storedDays()).length, dayNumber(BACKFILL_END) + 1);
    });
  });

  describe("POST /api/grade", () => {
    it("grades rows in the order sent, with the day number and no answer", async () => {
      const answer = await answerOf();
      const wrong = ALL_IDS.filter((id) => id !== answer).slice(0, 2);
      const { status, body } = await post(wrong);
      assert.equal(status, 200);
      assert.equal(body.day, dayNumber(BACKFILL_END));
      assert.equal(body.victory, false);
      assert.deepEqual(Object.keys(body).sort(), ["day", "rows", "victory"]);
      assert.deepEqual(
        body.rows!.map((row) => row[1]!.value),
        wrong.map((id) => GUESS_DATA.find((p) => p.id === id)!.name),
      );
      assert.deepEqual(
        body.rows![0]!.map((cell) => cell.key),
        ["photo", "name", "colors", "owners"],
      );
    });

    it("reveals the answer name on a correct guess", async () => {
      const answer = await answerOf();
      const { body } = await post([answer]);
      assert.equal(body.victory, true);
      assert.equal(body.answer, GUESS_DATA.find((p) => p.id === answer)!.name);
    });

    it("accepts an empty list", async () => {
      const { status, body } = await post([]);
      assert.equal(status, 200);
      assert.deepEqual(body.rows, []);
    });

    it("rejects unknown ids with a JSON invalid error", async () => {
      for (const ids of [["not-a-pet"], [ALL_IDS[0], "nope"], [""], ["Ati"]]) {
        const { status, body } = await post(ids);
        assert.equal(status, 400, JSON.stringify(ids));
        assert.equal(body.error, "invalid");
      }
    });

    it("rejects duplicate ids with a JSON duplicate error", async () => {
      const { status, body } = await post([ALL_IDS[0], ALL_IDS[0]]);
      assert.equal(status, 409);
      assert.equal(body.error, "duplicate");
    });

    it("rejects more ids than the roster has", async () => {
      const { status, body } = await post([...ALL_IDS, ALL_IDS[0]]);
      assert.equal(status, 400);
      assert.equal(body.error, "invalid");
    });

    it("rejects a body of the wrong shape", async () => {
      for (const ids of [
        "ati",
        null,
        7,
        { 0: "ati" },
        [1],
        [null],
        [["ati"]],
      ]) {
        const { status, body } = await post(ids);
        assert.equal(status, 400, JSON.stringify(ids));
        assert.equal(body.error, "invalid");
      }
      const noIds = await post(undefined, { body: "{}" });
      assert.equal(noIds.status, 400);
    });

    it("rejects malformed JSON, a non-JSON content type and an oversize body", async () => {
      const malformed = await post(null, { body: "{ids:" });
      assert.deepEqual(
        [malformed.status, malformed.body.error],
        [400, "invalid"],
      );
      const text = await post(null, {
        body: JSON.stringify({ ids: [] }),
        type: "text/plain",
      });
      assert.deepEqual([text.status, text.body.error], [400, "invalid"]);
      const none = await post(null, { body: "", type: null });
      assert.deepEqual([none.status, none.body.error], [400, "invalid"]);
      const big = await post(null, {
        body: JSON.stringify({ ids: ["x".repeat(11_000)] }),
      });
      assert.deepEqual([big.status, big.body.error], [413, "invalid"]);
    });

    it("fails with a JSON error while the stored pet is not in the roster", async () => {
      await db.pool.query(
        "update daily_answers set pet_id = 'removed-pet' where day = $1",
        [BACKFILL_END],
      );
      try {
        const { status, body } = await post([ALL_IDS[0]]);
        assert.equal(status, 500);
        assert.equal(body.error, "answer_missing");
      } finally {
        await db.pool.query(
          "update daily_answers set pet_id = $2 where day = $1",
          [BACKFILL_END, backfill[BACKFILL_END]],
        );
      }
    });

    it("does not leak the answer in an error response", async () => {
      const answer = await answerOf();
      const { body } = await post([answer, answer]);
      assert.equal(body.answer, undefined);
    });
  });

  describe("POST /api/give-up", () => {
    const giveUp = async (
      init: RequestInit = { method: "POST" },
    ): Promise<Reply> => {
      const res = await fetch(`${url}/api/give-up`, init);
      return { status: res.status, body: (await res.json()) as Body };
    };

    it("reveals today's answer name and the day number", async () => {
      const answer = await answerOf();
      const { status, body } = await giveUp();
      assert.equal(status, 200);
      assert.equal(body.day, dayNumber(BACKFILL_END));
      assert.equal(
        GUESS_DATA.find((pet) => pet.id === answer)!.name,
        body.answer,
      );
      assert.deepEqual(Object.keys(body).sort(), ["answer", "day"]);
    });

    it("is stateless: needs no body or content type, same reply every time", async () => {
      const first = await giveUp();
      const second = await giveUp({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: ["whatever"] }),
      });
      assert.equal(first.status, 200);
      assert.deepEqual(second, first);
    });

    it("generates and stores a missing day like a first grade request", async () => {
      today = dateOfDay(dayNumber(BACKFILL_END) + 1);
      const { status, body } = await giveUp();
      assert.equal(status, 200);
      assert.equal(body.day, dayNumber(today));
      assert.equal((await storedDays()).at(-1)!.day, today);
      assert.equal(draws, 1);
      assert.equal(
        await answerOf(),
        GUESS_DATA.find((p) => p.name === body.answer)!.id,
      );
    });

    it("moves to the new day at the server time zone midnight", async () => {
      clock = new Date("2026-10-16T20:59:59Z"); // 23:59:59 in Sofia (UTC+3)
      const before = await giveUp();
      clock = new Date("2026-10-16T21:00:00Z");
      const after = await giveUp();
      assert.equal(before.body.day, dayNumber("2026-10-16"));
      assert.equal(after.body.day, dayNumber("2026-10-17"));
    });

    it("answers 404 to other methods", async () => {
      const { status, body } = await giveUp({ method: "GET" });
      assert.deepEqual([status, body.error], [404, "not_found"]);
    });

    it("fails with a JSON error while the stored pet is not in the roster", async () => {
      await db.pool.query(
        "update daily_answers set pet_id = 'removed-pet' where day = $1",
        [BACKFILL_END],
      );
      try {
        const { status, body } = await giveUp();
        assert.deepEqual([status, body.error], [500, "answer_missing"]);
        assert.equal(body.answer, undefined);
      } finally {
        await db.pool.query(
          "update daily_answers set pet_id = $2 where day = $1",
          [BACKFILL_END, backfill[BACKFILL_END]],
        );
      }
    });
  });
});
