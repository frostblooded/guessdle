import assert from "node:assert/strict";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, beforeEach, describe, it } from "node:test";
import { ANSWER_SKIP_PERIOD, GUESS_DATA } from "../../src/game/roster.ts";
import { dateOfDay, dayNumber } from "../../src/server/answers.ts";
import { createApp } from "../../src/server/app.ts";
import { MIGRATIONS_DIR } from "../../src/server/main.ts";
import { migrate } from "../../src/server/migrate.ts";
import { startDb } from "./postgres.ts";
import type { TestDb } from "./postgres.ts";

const TODAY = "2026-10-16";
const TODAY_N = dayNumber(TODAY);
// What the backfill stores for TODAY
const TODAY_PET = "bela";
const ALL_IDS = GUESS_DATA.map((pet) => pet.id);
const at = (offset: number): string => dateOfDay(TODAY_N + offset);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Body = any;
interface Reply {
  status: number;
  body: Body;
}

describe("admin Answers: peek and overrides", () => {
  let db: TestDb;
  let server: Server;
  let url: string;
  let draws = 0;
  let random: () => number = () => 0;
  let admin: string;

  const send = async (
    method: string,
    path: string,
    cookie: string | null,
    body?: unknown,
  ): Promise<Reply> => {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (cookie !== null) {
      headers["Cookie"] = cookie;
    }
    const res = await fetch(`${url}${path}`, {
      method,
      headers,
      ...(body !== undefined && { body: JSON.stringify(body) }),
    });
    return { status: res.status, body: await res.json() };
  };
  const login = async (email: string, isAdmin = false): Promise<string> => {
    const res = await fetch(`${url}/api/test/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, admin: isAdmin }),
    });
    return res.headers.get("set-cookie")!.split(";")[0]!;
  };
  const list = (from?: string, to?: string): Promise<Reply> =>
    send(
      "GET",
      `/api/admin/answers${from ? `?from=${from}&to=${to}` : ""}`,
      admin,
    );
  const put = (date: string, petId: unknown): Promise<Reply> =>
    send("PUT", `/api/admin/answers/${date}`, admin, { petId });
  const clear = (date: string): Promise<Reply> =>
    send("DELETE", `/api/admin/answers/${date}`, admin, {});
  const stored = async (): Promise<
    { day: string; pet_id: string; source: string }[]
  > =>
    (
      await db.pool.query(
        "select to_char(day, 'YYYY-MM-DD') as day, pet_id, source from daily_answers where day > $1 order by day",
        [TODAY],
      )
    ).rows;
  // What a player gets for the current day
  const playerAnswer = async (): Promise<string> => {
    const res = await fetch(`${url}/api/grade`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: ALL_IDS }),
    });
    const name = ((await res.json()) as Body).answer;
    return GUESS_DATA.find((pet) => pet.name === name)!.id;
  };
  // The pet the draw rule picks for a random value, after `prev`
  const draw = (prev: string[], r: number): string => {
    const recent = prev.slice(-ANSWER_SKIP_PERIOD);
    const allowed = ALL_IDS.filter((id) => !recent.includes(id));
    return allowed[Math.floor(r * allowed.length)]!;
  };
  const allRows = async (): Promise<string[]> =>
    (
      await db.pool.query("select pet_id from daily_answers order by day")
    ).rows.map((r) => r.pet_id as string);
  const assertWindowsHold = async (): Promise<void> => {
    const rows = await allRows();
    rows.forEach((id, i) => {
      for (let back = 1; back <= ANSWER_SKIP_PERIOD && back <= i; back++) {
        assert.notEqual(id, rows[i - back], `day ${i}`);
      }
    });
  };
  const someOtherPet = (...not: string[]): string =>
    ALL_IDS.find((id) => !not.includes(id))!;

  before(async () => {
    db = await startDb();
    await migrate(db.pool, MIGRATIONS_DIR);
    server = await new Promise<Server>((resolve) => {
      const s = createApp({
        pool: db.pool,
        now: () => new Date(`${TODAY}T10:00:00Z`),
        random: () => {
          draws++;
          return random();
        },
        testLogin: true,
      }).listen(0, "127.0.0.1", () => resolve(s));
    });
    url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    admin = await login("admin@x.test", true);
  });
  after(async () => {
    server.close();
    await db.stop();
  });
  beforeEach(async () => {
    await db.pool.query("delete from daily_answers where day > $1", [TODAY]);
    await db.pool.query(
      "update daily_answers set pet_id = $2, source = 'generated' where day = $1",
      [TODAY, TODAY_PET],
    );
    await db.pool.query("delete from users where email <> 'admin@x.test'");
    draws = 0;
    random = () => 0;
  });

  describe("access", () => {
    const calls: [string, string, unknown][] = [
      ["GET", "/api/admin/answers", undefined],
      ["PUT", `/api/admin/answers/${at(1)}`, { petId: "ati" }],
      ["DELETE", `/api/admin/answers/${at(1)}`, {}],
    ];

    it("answers 401 without a session", async () => {
      for (const [method, path, body] of calls) {
        assert.equal((await send(method, path, null, body)).status, 401, path);
      }
    });

    it("answers 403 to a signed-in non-admin and changes nothing", async () => {
      const player = await login("player@x.test");
      for (const [method, path, body] of calls) {
        assert.equal(
          (await send(method, path, player, body)).status,
          403,
          path,
        );
      }
      assert.deepEqual(await stored(), []);
    });

    it("reports the admin flag on /api/me so the client can show the panel", async () => {
      assert.equal((await send("GET", "/api/me", admin)).body.user.admin, true);
      const player = await login("player@x.test");
      assert.equal(
        (await send("GET", "/api/me", player)).body.user.admin,
        false,
      );
    });
  });

  describe("peek", () => {
    it("defaults to today and the next six days and saves what it shows", async () => {
      const { status, body } = await list();
      assert.equal(status, 200);
      assert.equal(body.today, TODAY);
      assert.deepEqual(
        body.days.map((d: Body) => d.date),
        [0, 1, 2, 3, 4, 5, 6].map(at),
      );
      assert.equal((await stored()).length, 6);
      assert.equal(draws, 6);
    });

    it("shows pet, source, today badge and past rows locked", async () => {
      const { body } = await list(at(-1), at(1));
      const [past, now, next] = body.days;
      assert.deepEqual(
        [past.locked, now.locked, next.locked],
        [true, false, false],
      );
      assert.deepEqual(
        [past.today, now.today, next.today],
        [false, true, false],
      );
      assert.equal(now.source, "generated");
      const pet = GUESS_DATA.find((p) => p.id === now.petId)!;
      assert.equal(now.name, pet.name);
      assert.equal(now.missing, false);
    });

    it("matches what players get", async () => {
      const { body } = await list(at(0), at(3));
      const peeked: string[] = body.days.map((d: Body) => d.petId);
      assert.equal(await playerAnswer(), peeked[0]);
      assert.deepEqual(
        (await stored()).map((r) => r.pet_id),
        peeked.slice(1),
      );
    });

    it("is stable: showing again draws nothing new", async () => {
      const first = await list(at(0), at(4));
      draws = 0;
      const second = await list(at(0), at(4));
      assert.deepEqual(second.body.days, first.body.days);
      assert.equal(draws, 0);
    });

    it("fills every day up to the range end in order, holding the Skip Period", async () => {
      random = () => 0.5;
      await list(at(30), at(31));
      assert.equal((await stored()).length, 31);
      await assertWindowsHold();
    });

    it("does not generate when the range ends at or before the last stored day", async () => {
      const { status, body } = await list(at(-5), at(0));
      assert.equal(status, 200);
      assert.equal(body.days.length, 6);
      assert.equal(draws, 0);
    });

    it("clamps a range that starts before Day Number 0", async () => {
      const { body } = await list("2020-01-01", "2025-08-16");
      assert.deepEqual(
        body.days.map((d: Body) => d.date),
        ["2025-08-15", "2025-08-16"],
      );
    });

    it("lists the pets of the previous five days for the soft notice", async () => {
      const { body } = await list(at(0), at(2));
      const rows = await allRows();
      const day = TODAY_N + 2;
      assert.deepEqual(body.days[2].previous, rows.slice(day - 5, day));
    });

    it("rejects malformed, reversed, oversized and far-future ranges without writing", async () => {
      for (const [from, to] of [
        ["nope", at(1)],
        [at(0), "2026-13-45"],
        [at(3), at(1)],
        [at(0), at(400)],
        [at(0), at(1000)],
      ] as const) {
        const res = await list(from, to);
        assert.equal(res.status, 400, `${from}..${to}`);
        assert.equal(res.body.error, "invalid");
      }
      assert.deepEqual(await stored(), []);
    });

    it("flags a day whose pet is no longer in the roster", async () => {
      await db.pool.query(
        "update daily_answers set pet_id = 'gone' where day = $1",
        [TODAY],
      );
      const { body } = await list(at(0), at(0));
      assert.equal(body.days[0].missing, true);
      assert.equal(body.days[0].name, null);
    });
  });

  describe("override", () => {
    it("sets a future stored day and marks it override", async () => {
      await list(at(0), at(3));
      const pet = someOtherPet();
      assert.equal((await put(at(2), pet)).status, 200);
      const { body } = await list(at(2), at(2));
      assert.deepEqual(
        [body.days[0].petId, body.days[0].source],
        [pet, "override"],
      );
    });

    it("on an unstored day fills the gap first, then writes the row", async () => {
      const pet = someOtherPet();
      assert.equal((await put(at(4), pet)).status, 200);
      const rows = await stored();
      assert.deepEqual(
        rows.map((r) => r.day),
        [1, 2, 3, 4].map(at),
      );
      assert.deepEqual(
        rows.map((r) => r.source),
        ["generated", "generated", "generated", "override"],
      );
      assert.equal(rows[3]!.pet_id, pet);
      assert.equal(draws, 3);
    });

    it("applies to today at once for mid-game players, deriving victory", async () => {
      const player = await login("mid@x.test");
      const answer = await playerAnswer();
      const other = someOtherPet(answer);
      const guessed = await send("POST", "/api/game/guess", player, {
        id: other,
      });
      assert.equal(guessed.body.victory, false);

      // Overriding today to the guessed pet turns that guess into a win
      assert.equal((await put(at(0), other)).status, 200);
      assert.equal(await playerAnswer(), other);
      const game = await send("GET", "/api/game", player);
      assert.equal(game.body.victory, true);
      assert.equal(
        game.body.answer,
        GUESS_DATA.find((p) => p.id === other)!.name,
      );

      // ...and away again: no stale win
      assert.equal((await put(at(0), answer)).status, 200);
      assert.equal(
        (await send("GET", "/api/game", player)).body.victory,
        false,
      );
    });

    it("rejects past days and leaves them untouched", async () => {
      const before = await allRows();
      for (const method of ["PUT", "DELETE"]) {
        const res = await send(method, `/api/admin/answers/${at(-1)}`, admin, {
          petId: "ati",
        });
        assert.equal(res.status, 409, method);
        assert.equal(res.body.error, "past_day");
      }
      assert.deepEqual(await allRows(), before);
    });

    it("rejects an unknown pet, a bad date, a non-string pet and days before the start or too far ahead", async () => {
      for (const [date, petId] of [
        [at(1), "nope"],
        [at(1), 5],
        [at(1), undefined],
        ["garbage", "ati"],
        ["2025-08-14", "ati"],
        [at(500), "ati"],
      ] as const) {
        const res = await put(date, petId);
        assert.equal(res.status, 400, `${date} ${String(petId)}`);
        assert.equal(res.body.error, "invalid");
      }
      assert.deepEqual(await stored(), []);
    });

    it("re-draws later generated days and keeps overrides, over stored history", async () => {
      random = () => 0;
      await list(at(0), at(8));
      const keep = someOtherPet();
      await put(at(6), keep);
      const beforeRows = await stored();

      random = () => 0.999;
      const pet = someOtherPet(keep);
      await put(at(2), pet);

      const rows = await stored();
      const byDay = Object.fromEntries(rows.map((r) => [r.day, r]));
      // Days before the override are unchanged; the override itself holds
      assert.equal(byDay[at(1)]!.pet_id, beforeRows[0]!.pet_id);
      assert.equal(byDay[at(2)]!.pet_id, pet);
      // The later override survived; later generated days follow the new draws
      assert.deepEqual(
        [byDay[at(6)]!.pet_id, byDay[at(6)]!.source],
        [keep, "override"],
      );
      let prev = (await allRows()).slice(0, TODAY_N + 3);
      for (const offset of [3, 4, 5]) {
        const expected = draw(prev, 0.999);
        assert.equal(byDay[at(offset)]!.pet_id, expected, `day +${offset}`);
        prev = [...prev, expected];
      }
      prev = [...prev, keep];
      for (const offset of [7, 8]) {
        const expected = draw(prev, 0.999);
        assert.equal(byDay[at(offset)]!.pet_id, expected, `day +${offset}`);
        prev = [...prev, expected];
      }
    });

    it("re-draws nothing when the changed day is the last stored day", async () => {
      await list(at(0), at(2));
      draws = 0;
      await put(at(2), someOtherPet());
      assert.equal(draws, 0);
    });

    it("clears an override back to a fresh generated answer and re-draws after it", async () => {
      random = () => 0;
      await list(at(0), at(5));
      await put(at(2), someOtherPet());
      random = () => 0.999;
      assert.equal((await clear(at(2))).status, 200);

      const rows = await stored();
      assert.ok(rows.every((r) => r.source === "generated"));
      const history = (await allRows()).slice(0, TODAY_N + 2);
      assert.equal(
        rows.find((r) => r.day === at(2))!.pet_id,
        draw(history, 0.999),
      );
      await assertWindowsHold();
    });

    it("clears today's override, which players see at once", async () => {
      const pet = someOtherPet(TODAY_PET);
      await put(at(0), pet);
      assert.equal(await playerAnswer(), pet);
      assert.equal((await clear(at(0))).status, 200);
      const { body } = await list(at(0), at(0));
      assert.equal(body.days[0].source, "generated");
      assert.equal(await playerAnswer(), body.days[0].petId);
    });

    it("refuses to clear a day that is not an override or not stored", async () => {
      await list(at(0), at(2));
      for (const date of [at(1), at(5)]) {
        const res = await clear(date);
        assert.equal(res.status, 409, date);
        assert.equal(res.body.error, "not_override");
      }
      assert.equal((await clear("garbage")).status, 400);
    });

    it("can override an override (edit)", async () => {
      await list(at(0), at(2));
      const first = someOtherPet();
      await put(at(1), first);
      await put(at(1), someOtherPet(first));
      const { body } = await list(at(1), at(1));
      assert.deepEqual(
        [body.days[0].petId, body.days[0].source],
        [someOtherPet(first), "override"],
      );
    });

    it("changes nothing when the re-draw fails midway", async () => {
      await list(at(0), at(5));
      const before = await stored();
      let calls = 0;
      random = () => {
        if (++calls === 2) {
          throw new Error("boom");
        }
        return 0;
      };
      const res = await put(at(1), someOtherPet());
      assert.equal(res.status, 500);
      assert.deepEqual(await stored(), before);
    });

    it("stays consistent under concurrent overrides and peeks", async () => {
      random = () => Math.random();
      await Promise.all([
        put(at(3), ALL_IDS[0]),
        put(at(1), ALL_IDS[1]),
        list(at(0), at(12)),
        put(at(2), ALL_IDS[2]),
      ]);
      const rows = await stored();
      assert.equal(rows.length, 12);
      assert.deepEqual(
        rows.filter((r) => r.source === "override").map((r) => r.day),
        [at(1), at(2), at(3)],
      );
    });
  });
});
