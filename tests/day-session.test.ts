import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { SKIP } from "../src/game/game.ts";
import type { GameRow, Roster } from "../src/server/games.ts";
import {
  daySession,
  requestStore,
  type GameView,
} from "../src/server/day-session.ts";
import type { PlayDay } from "../src/server/play-day.ts";
import { ATTRIBUTES, GUESS_DATA } from "./roster-fixture.ts";

const classic = {
  id: 1,
  kind: "classic",
  blurTries: 3,
  startDate: "2026-10-10",
} as GameRow;
const blur = { ...classic, kind: "blur" } as GameRow;
const roster = {
  attributes: ATTRIBUTES,
  entries: GUESS_DATA,
  all: GUESS_DATA,
  incomplete: 0,
} as Roster;
const answer = GUESS_DATA[0]!;
const wrong = GUESS_DATA.filter((e) => e.id !== answer.id).map((e) => e.id);
const dayOf = (game: GameRow, past = false): PlayDay => ({
  game,
  roster,
  answer,
  revision: 0,
  date: "2026-10-16",
  day: 6,
  past,
});

// The game_results rows a session writes: [guesses, won]
const results = () => {
  const rows: [number, boolean][] = [];
  const q = {
    query: async (text: string, params: unknown[] = []) => {
      if (text.startsWith("insert into game_results")) {
        const won = !text.includes("won) values");
        rows.push([params[3] as number, won]);
      }
      return { rows: [], rowCount: 0 };
    },
  } as never;
  return { q, rows };
};
const session = (
  game: GameRow,
  ids: number[] = [],
  player: string | null = "anon:t",
) => {
  const { q, rows } = results();
  const s = daySession(q, dayOf(game), player, requestStore(ids), () => 0);
  return { s, rows };
};
const viewOf = (out: unknown): GameView => {
  assert.equal(typeof out, "object", String(out));
  return out as GameView;
};

describe("daySession", () => {
  it("grades a guest's list and reveals the answer only once won", async () => {
    const { s, rows } = session(classic, [wrong[0]!]);
    const playing = viewOf(await s.view());
    assert.equal(playing.victory, false);
    assert.equal(playing.answer, undefined);
    const won = viewOf(await s.guess(answer.id));
    assert.equal(won.victory, true);
    assert.equal(won.answer, answer.name);
    assert.deepEqual(rows, []);
  });

  it("refuses an ungradable list, an unknown id, a repeat and a guess once over", async () => {
    assert.equal(await session(classic, [9999]).s.view(), "invalid");
    const { s } = session(classic, [wrong[0]!]);
    assert.equal(await s.guess(9999), "invalid");
    assert.equal(await s.guess(wrong[0]), "duplicate");
    await s.guess(answer.id);
    assert.equal(await s.guess(wrong[1]), "finished");
    assert.equal(await s.giveUp(), "finished");
  });

  it("takes the first try on a give-up, with the guesses made", async () => {
    const { s, rows } = session(classic, [wrong[0]!]);
    const out = viewOf(await s.giveUp());
    assert.equal(out.gaveUp, true);
    assert.equal(out.answer, answer.name);
    assert.deepEqual(rows, [[1, false]]);
  });

  it("takes the first try when a Blur game's last try misses", async () => {
    const { s, rows } = session(blur, [wrong[0]!, SKIP]);
    const out = viewOf(await s.guess(wrong[1]));
    assert.equal(out.lost, true);
    assert.equal(out.answer, answer.name);
    assert.deepEqual(rows, [[3, false]]);
  });

  it("records nothing for a guest without a token", async () => {
    const { s, rows } = session(classic, [], null);
    await s.giveUp();
    assert.deepEqual(rows, []);
    assert.equal(await s.win(0), "not_won");
  });

  it("offers the Free Hint after three wrong guesses, once", async () => {
    const { s } = session(classic, wrong.slice(0, 2));
    assert.equal(await s.hint("attribute"), "no_hint");
    await s.guess(wrong[2]);
    assert.equal(await s.hint("nonsense"), "invalid");
    const out = viewOf(await s.hint("attribute"));
    assert.ok(out.hint);
    assert.equal(out.hints, undefined);
    assert.equal(await s.hint("attribute"), "no_hint");
  });

  it("adopts a browser's Board: deduped, cut at the answer, and only today", async () => {
    const { s } = session(classic);
    const local = { day: 6, revision: 0 };
    assert.equal(await s.merge({ ...local, ids: [9999] }), "invalid");
    assert.equal(
      await s.merge({ ...local, day: 5, ids: [wrong[0]] }),
      "stale_day",
    );
    const out = viewOf(
      await s.merge({
        ...local,
        ids: [wrong[0], wrong[0], answer.id, wrong[1]],
      }),
    );
    assert.deepEqual(out.ids, [wrong[0], answer.id]);
    assert.equal(out.victory, true);
    assert.equal(await s.merge({ ...local, ids: [] }), "has_progress");
    const { q } = results();
    const past = daySession(
      q,
      dayOf(classic, true),
      "anon:t",
      requestStore(),
      () => 0,
    );
    assert.equal(await past.merge({ ...local, ids: [] }), "stale_day");
  });

  it("records a win only for a Board ending with the answer", async () => {
    assert.equal(await session(classic, [wrong[0]!]).s.win(5), "not_won");
    const { s, rows } = session(classic, [wrong[0]!, answer.id]);
    const won = await s.win(5);
    assert.ok(won !== "not_won");
    assert.equal(won.guesses, 2);
    assert.deepEqual(rows, [[2, true]]);
  });

  it("starts over on reset", async () => {
    const { s } = session(classic, [wrong[0]!]);
    await s.giveUp();
    const out = viewOf(await s.reset());
    assert.deepEqual(out.ids, []);
    assert.equal(out.gaveUp, false);
  });
});
