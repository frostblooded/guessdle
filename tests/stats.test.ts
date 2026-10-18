import assert from "node:assert/strict";
import { describe, it } from "vitest";
import {
  formatSeconds,
  isPlayerToken,
  MAX_GUESS_BAR,
  playerToken,
  summarize,
  timeBucket,
  TIME_BUCKETS,
} from "../src/game/stats.ts";

describe("summarize", () => {
  const results = [
    { guesses: 3, seconds: 40 },
    { guesses: 5, seconds: 200 },
    { guesses: 3, seconds: null },
    { guesses: 14, seconds: 900 },
  ];

  it("counts winners per guess count, the last bar holding the long tail", () => {
    const stats = summarize(7, results, null);
    assert.equal(stats.day, 7);
    assert.equal(stats.players, 4);
    assert.equal(stats.guesses.length, MAX_GUESS_BAR);
    assert.equal(stats.guesses[2], 2);
    assert.equal(stats.guesses[4], 1);
    assert.equal(stats.guesses[MAX_GUESS_BAR - 1], 1);
  });

  it("buckets known times and skips unknown ones", () => {
    const { times } = summarize(7, results, null);
    assert.equal(times.length, TIME_BUCKETS.length);
    assert.deepEqual(times, [0, 1, 0, 1, 0, 1]);
  });

  it("compares the player with everyone else, not with themself", () => {
    const you = { guesses: 5, seconds: 200 };
    const stats = summarize(7, results, you);
    assert.deepEqual(stats.you, you);
    // Of the 3 others, only the 14-guess win took more
    assert.equal(stats.fewerGuessesThan, 33);
    // Of the 2 others with a time, only the 900s one was slower
    assert.equal(stats.fasterThan, 50);
  });

  it("has nothing to compare when the player is the only winner", () => {
    const you = { guesses: 2, seconds: 10 };
    const stats = summarize(7, [you], you);
    assert.equal(stats.fewerGuessesThan, null);
    assert.equal(stats.fasterThan, null);
  });

  it("has no time comparison when the player's time is unknown", () => {
    const you = { guesses: 3, seconds: null };
    assert.equal(summarize(7, results, you).fasterThan, null);
  });
});

describe("timeBucket", () => {
  it("puts each time under the first limit above it", () => {
    assert.equal(timeBucket(0), 0);
    assert.equal(timeBucket(29), 0);
    assert.equal(timeBucket(30), 1);
    assert.equal(timeBucket(599), 4);
    assert.equal(timeBucket(86_400), 5);
  });
});

describe("formatSeconds", () => {
  it("reads as seconds, minutes or hours", () => {
    assert.equal(formatSeconds(42), "42s");
    assert.equal(formatSeconds(185), "3m 05s");
    assert.equal(formatSeconds(3725), "1h 02m");
  });
});

describe("playerToken", () => {
  const memory = () => {
    const items = new Map<string, string>();
    return {
      items,
      getItem: (k: string) => items.get(k) ?? null,
      setItem: (k: string, v: string) => void items.set(k, v),
    };
  };

  it("makes one token per browser and keeps it", () => {
    const storage = memory();
    const first = playerToken(storage, () => "aaaaaaaa-bbbb-cccc-dddd");
    assert.equal(first, "aaaaaaaa-bbbb-cccc-dddd");
    assert.equal(
      playerToken(storage, () => "other-token-0000000"),
      first,
    );
  });

  it("replaces a malformed stored token", () => {
    const storage = memory();
    storage.items.set("guessdle:player", "x");
    assert.equal(
      playerToken(storage, () => "fresh-token-00000000"),
      "fresh-token-00000000",
    );
  });

  it("still answers when storage is blocked", () => {
    const blocked = {
      getItem: (): string => {
        throw new Error("blocked");
      },
      setItem: (): void => {},
    };
    const token = playerToken(blocked, () => "memory-token-0000000");
    assert.equal(playerToken(blocked), token);
  });

  it("accepts only plain tokens of a sane length", () => {
    assert.ok(isPlayerToken(crypto.randomUUID()));
    assert.ok(!isPlayerToken("short"));
    assert.ok(!isPlayerToken("has spaces in it, sixteen+"));
    assert.ok(!isPlayerToken(42));
  });
});
