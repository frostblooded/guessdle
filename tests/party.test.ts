import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { Correctness } from "../src/game/correctness.ts";
import { SKIP, type Entry } from "../src/game/game.ts";
import {
  cleanNickname,
  clockTime,
  drawAnswer,
  everyoneDone,
  normalizeCode,
  ordinal,
  parseClientMessage,
  partyView,
  progressLabel,
  randomCode,
  roundResults,
  standings,
  type PartyPlayer,
  type RoundData,
} from "../src/game/party.ts";

const player = (id: number, nickname: string, joinedAt = 0): PartyPlayer => ({
  id,
  nickname,
  host: id === 1,
  joinedAt,
});
const ANA = player(1, "Ana");
const BO = player(2, "Bo");
const CY = player(3, "Cy");

const round = (over: Partial<RoundData> = {}): RoundData => ({
  number: 1,
  answerId: 10,
  startedAt: 1000,
  endedAt: 9000,
  guesses: [],
  giveUps: [],
  ...over,
});
const g = (playerId: number, entryId: number, at: number) => ({
  playerId,
  entryId,
  at,
});

describe("party codes", () => {
  it("draws 4 letters with no I or O", () => {
    let i = 0;
    const values = [0, 0.99, 0.5, 0.3];
    assert.equal(
      randomCode(() => values[i++]!),
      "AZNH",
    );
    for (let n = 0; n < 200; n++) {
      assert.match(randomCode(Math.random), /^[A-HJ-NP-Z]{4}$/);
    }
  });

  it("normalizes typed codes and refuses anything else", () => {
    assert.equal(normalizeCode(" kwzp "), "KWZP");
    for (const bad of ["", "KWZ", "KWZPQ", "KW1P", "KWOP", "KW P"]) {
      assert.equal(normalizeCode(bad), null, bad);
    }
  });
});

describe("cleanNickname", () => {
  it("trims and collapses spaces", () => {
    assert.equal(cleanNickname("  Ana   Maria "), "Ana Maria");
  });
  it("refuses empty, too long, control characters and non-strings", () => {
    for (const bad of [
      "",
      "   ",
      "x".repeat(21),
      "a\u0000b",
      "a\nb",
      3,
      null,
    ]) {
      assert.equal(cleanNickname(bad), null, String(bad));
    }
    assert.equal(cleanNickname("x".repeat(20)), "x".repeat(20));
    // Counted in characters, not UTF-16 units
    assert.equal(cleanNickname("😀".repeat(20)), "😀".repeat(20));
  });
});

describe("roundResults", () => {
  it("ranks solvers by guesses, then time, and gives N, N-1, ... points", () => {
    const r = round({
      guesses: [
        g(1, 3, 1500),
        g(1, 10, 2000), // Ana: 2 guesses, 1 s
        g(2, 10, 5000), // Bo: 1 guess, 4 s
        g(3, 4, 1200),
        g(3, 10, 1800), // Cy: 2 guesses, 0.8 s
      ],
    });
    assert.deepEqual(
      roundResults([ANA, BO, CY], r).map((x) => [
        x.playerId,
        x.place,
        x.points,
        x.timeMs,
      ]),
      [
        [2, 1, 3, 4000],
        [3, 2, 2, 800],
        [1, 3, 1, 1000],
      ],
    );
  });

  it("gives unsolved players 0 and shares a place on an exact tie", () => {
    const r = round({
      guesses: [g(1, 10, 2000), g(2, 10, 2000), g(3, 4, 1500)],
      giveUps: [{ playerId: 3, at: 1600 }],
    });
    assert.deepEqual(
      roundResults([ANA, BO, CY], r).map((x) => [
        x.playerId,
        x.place,
        x.points,
        x.gaveUp,
      ]),
      [
        [1, 1, 3, false],
        [2, 1, 3, false],
        [3, null, 0, true],
      ],
    );
  });

  it("counts late joiners in, but not players who joined after it ended", () => {
    const late = player(4, "Late", 5000);
    const after = player(5, "After", 9500);
    const r = round({ guesses: [g(4, 10, 6000)] });
    const results = roundResults([ANA, late, after], r);
    assert.deepEqual(
      results.map((x) => [x.playerId, x.points]),
      [
        [4, 2],
        [1, 0],
      ],
    );
  });
});

describe("everyoneDone", () => {
  it("is true once every player solved or gave up", () => {
    const live = round({ endedAt: null, guesses: [g(1, 10, 2000)] });
    assert.equal(everyoneDone([ANA, BO], live), false);
    assert.equal(
      everyoneDone([ANA, BO], {
        ...live,
        giveUps: [{ playerId: 2, at: 3000 }],
      }),
      true,
    );
    assert.equal(everyoneDone([], live), false);
  });
});

describe("standings", () => {
  it("adds points over finished rounds only, most first, ties sharing a place", () => {
    const one = round({
      guesses: [g(1, 10, 2000), g(2, 3, 2100), g(2, 10, 2200)],
    });
    const two = round({
      number: 2,
      guesses: [g(2, 10, 2000), g(1, 3, 2100), g(1, 10, 2200)],
    });
    const live = round({ number: 3, endedAt: null, guesses: [g(1, 10, 1100)] });
    assert.deepEqual(
      standings([ANA, BO, CY], [one, two, live]).map((s) => [
        s.nickname,
        s.points,
        s.place,
      ]),
      [
        ["Ana", 5, 1],
        ["Bo", 5, 1],
        ["Cy", 0, 3],
      ],
    );
  });
});

describe("partyView", () => {
  const entry = (id: number, name: string, color: string): Entry => ({
    id,
    name,
    photo: `/p/${id}.webp`,
    values: [color],
  });
  const all = [
    entry(3, "Cookie", "Black"),
    entry(4, "Dido", "White"),
    entry(10, "Bela", "White"),
  ];
  const view = (rounds: RoundData[], viewer: number | null, ended = false) =>
    partyView({
      code: "KWZP",
      game: { slug: "pets", name: "Pets" },
      attributes: [{ name: "Color", type: "text" }],
      entries: all,
      all,
      ended,
      players: [ANA, BO],
      rounds,
      viewer,
    });

  it("shows a live round as counts only, and the viewer their own rows", () => {
    const live = round({
      endedAt: null,
      guesses: [g(1, 4, 1500), g(2, 3, 1600), g(2, 4, 1700)],
    });
    const mine = view([live], 1);
    assert.deepEqual(mine.you, { playerId: 1, host: true });
    assert.equal(mine.round!.live, true);
    assert.deepEqual(mine.round!.progress, [
      { playerId: 1, guesses: 1, solved: false, gaveUp: false, lost: false },
      { playerId: 2, guesses: 2, solved: false, gaveUp: false, lost: false },
    ]);
    assert.equal(mine.round!.yours!.rows.length, 1);
    assert.equal(mine.round!.yours!.rows[0]![1]!.value, "Dido");
    assert.equal(mine.round!.yours!.answer, undefined);
    assert.deepEqual(mine.history, []);
    // Nothing in a visitor's view names the answer or anyone's guesses
    const visitor = view([live], null);
    assert.equal(visitor.you, null);
    assert.equal(visitor.round!.yours, null);
    assert.ok(!JSON.stringify(visitor.round).includes("Dido"));
    assert.ok(!JSON.stringify({ ...visitor, game: null }).includes("Bela"));
  });

  it("reveals the answer to a player who is done", () => {
    const live = round({ endedAt: null, giveUps: [{ playerId: 1, at: 1100 }] });
    assert.equal(view([live], 1).round!.yours!.answer!.name, "Bela");
    assert.equal(view([live], 2).round!.yours!.answer, undefined);
  });

  it("shows finished rounds, newest first, with everyone's guesses and grades", () => {
    const one = round({ guesses: [g(2, 4, 1500), g(2, 10, 1600)] });
    const two = round({ number: 2, answerId: 3, guesses: [g(1, 3, 1200)] });
    const out = view([one, two], null, true);
    assert.equal(out.ended, true);
    assert.deepEqual(
      out.history.map((r) => [r.number, r.answer.name]),
      [
        [2, "Cookie"],
        [1, "Bela"],
      ],
    );
    const bo = out.history[1]!.results[0]!;
    assert.deepEqual(bo.guessNames, ["Dido", "Bela"]);
    // Photo, name, Color: Dido is White like Bela
    assert.deepEqual(bo.grades[0], [
      Correctness.Incorrect,
      Correctness.Incorrect,
      Correctness.Correct,
    ]);
    assert.equal(out.round!.live, false);
  });
});

describe("Blur game rounds", () => {
  const entry = (id: number, name: string): Entry => ({
    id,
    name,
    photo: `/p/${id}.webp`,
    values: [],
  });
  const all = [entry(3, "Cookie"), entry(4, "Dido"), entry(10, "Bela")];
  const view = (rounds: RoundData[], viewer: number | null) =>
    partyView({
      code: "KWZP",
      game: { slug: "pics", name: "Pics", kind: "blur", blurTries: 2 },
      attributes: [],
      entries: all,
      all,
      ended: false,
      players: [ANA, BO],
      rounds,
      viewer,
    });

  it("ends a player's round after their last try, with no points", () => {
    const live = round({
      endedAt: null,
      tries: 2,
      guesses: [g(1, 3, 1100), g(1, 4, 1200), g(2, 10, 1300)],
    });
    assert.ok(everyoneDone([ANA, BO], live));
    const ana = view([live], 1).round!.yours!;
    assert.equal(ana.lost, true);
    assert.equal(ana.answer!.name, "Bela");
    // Names only on the board
    assert.deepEqual(ana.rows[0], [
      { key: "name", value: "Cookie", correctness: Correctness.Incorrect },
    ]);
    const results = roundResults([ANA, BO], { ...live, endedAt: 2000 });
    assert.deepEqual(
      results.map((r) => [r.playerId, r.points, r.lost]),
      [
        [2, 2, false],
        [1, 0, true],
      ],
    );
  });

  it("counts a skip as a try, shown as a skipped row", () => {
    const live = round({
      endedAt: null,
      tries: 2,
      guesses: [g(1, SKIP, 1100), g(1, 3, 1200)],
    });
    const ana = view([live], 1).round!.yours!;
    assert.equal(ana.lost, true);
    assert.deepEqual(
      ana.rows.map((row) => row[0]!.key),
      ["skip", "name"],
    );
  });

  it("sends no entry photos until a round is over", () => {
    const live = round({ endedAt: null, tries: 2 });
    const out = view([live], 1);
    assert.equal(out.game.kind, "blur");
    assert.ok(out.game.entries.every((e) => e.photo === ""));
    assert.equal(out.round!.yours!.answer, undefined);
  });
});

describe("drawAnswer", () => {
  it("avoids answers this party already had until all are used", () => {
    assert.equal(
      drawAnswer([1, 2, 3], [1, 3], () => 0.9),
      2,
    );
    assert.equal(
      drawAnswer([1, 2], [1, 2], () => 0.9),
      2,
    );
    assert.equal(
      drawAnswer([1, 2], [], () => 0),
      1,
    );
  });
});

describe("parseClientMessage", () => {
  it("reads the known messages", () => {
    assert.deepEqual(parseClientMessage('{"type":"hello"}'), { type: "hello" });
    assert.deepEqual(parseClientMessage('{"type":"hello","token":"t"}'), {
      type: "hello",
      token: "t",
    });
    assert.deepEqual(parseClientMessage('{"type":"guess","entryId":4}'), {
      type: "guess",
      entryId: 4,
    });
    assert.deepEqual(
      parseClientMessage('{"type":"remove-player","playerId":2}'),
      { type: "remove-player", playerId: 2 },
    );
    for (const type of ["give-up", "start-round", "end-round", "end-party"]) {
      assert.deepEqual(parseClientMessage(JSON.stringify({ type })), { type });
    }
  });
  it("refuses anything else", () => {
    for (const raw of [
      "nope",
      "null",
      "3",
      '{"type":"guess","entryId":"4"}',
      '{"type":"guess","entryId":1.5}',
      '{"type":"remove-player"}',
      '{"type":"hello","token":5}',
      `{"type":"hello","token":"${"x".repeat(101)}"}`,
      '{"type":"toString"}',
    ]) {
      assert.equal(parseClientMessage(raw), null, raw);
    }
  });
});

describe("text", () => {
  it("writes ordinals", () => {
    assert.deepEqual([1, 2, 3, 4, 11, 12, 13, 21, 22, 101, 111].map(ordinal), [
      "1st",
      "2nd",
      "3rd",
      "4th",
      "11th",
      "12th",
      "13th",
      "21st",
      "22nd",
      "101st",
      "111th",
    ]);
  });
  it("writes solve times as a clock", () => {
    assert.deepEqual(
      [0, 999, 7_400, 83_000, 600_000, 3_723_000].map(clockTime),
      ["0:00", "0:00", "0:07", "1:23", "10:00", "1:02:03"],
    );
  });
  it("labels progress", () => {
    const p = {
      playerId: 1,
      guesses: 1,
      solved: false,
      gaveUp: false,
      lost: false,
    };
    assert.equal(progressLabel(p), "1 guess");
    assert.equal(
      progressLabel({ ...p, guesses: 3, solved: true }),
      "3 guesses, solved",
    );
    assert.equal(
      progressLabel({ ...p, guesses: 0, gaveUp: true }),
      "0 guesses, gave up",
    );
    assert.equal(
      progressLabel({ ...p, guesses: 3, lost: true }),
      "3 guesses, out of tries",
    );
  });
});
