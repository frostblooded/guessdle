import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { createGameState } from "../src/game/game-state.ts";
import { mergeLocalGame } from "../src/game/merge.ts";

const now = (): Date => new Date("2026-10-16T10:00:00Z");

function memory() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
  };
}

function seeded(ids: number[], day: number | null, gaveUp: boolean = false) {
  const storage = memory();
  const state = createGameState(storage, now);
  state.setUsedGuesses(ids);
  if (day !== null) {
    state.setDay(day, 3);
  }
  if (gaveUp) {
    state.setGaveUp();
  }
  return storage;
}

const reply =
  (status: number, body: unknown = {}) =>
  async () => ({
    ok: status < 400,
    status,
    json: async () => body,
  });

describe("mergeLocalGame", () => {
  it("does not call the server when nothing is stored", async () => {
    let calls = 0;
    const out = await mergeLocalGame("pets", memory(), now, async () => {
      calls++;
      return reply(200)();
    });
    assert.equal(out, "nothing");
    assert.equal(calls, 0);
  });

  it("posts day, ids and gaveUp, then clears local guess state", async () => {
    const storage = seeded([1, 2], 427, true);
    let sent: { url: string; body: unknown } | null = null;
    const out = await mergeLocalGame(
      "pets",
      storage,
      now,
      async (url, init) => {
        sent = { url, body: JSON.parse(init!.body) };
        return reply(200)();
      },
    );
    assert.equal(out, "merged");
    assert.deepEqual(sent, {
      url: "/api/games/pets/state/merge",
      body: { day: 427, revision: 3, ids: [1, 2], gaveUp: true },
    });
    const state = createGameState(storage, now);
    assert.deepEqual(state.getUsedGuesses(), []);
    assert.equal(state.getDay(), null);
    assert.equal(state.getGaveUp(), false);
  });

  it("merges a stored give-up without guesses", async () => {
    const storage = seeded([], 427, true);
    assert.equal(
      await mergeLocalGame("pets", storage, now, reply(200)),
      "merged",
    );
  });

  for (const status of [409, 400]) {
    it(`discards local state on ${status} (server wins / unusable)`, async () => {
      const storage = seeded([1], 427);
      const out = await mergeLocalGame("pets", storage, now, reply(status));
      assert.equal(out, "discarded");
      assert.deepEqual(createGameState(storage, now).getUsedGuesses(), []);
    });
  }

  it("clears without merging when the stored day is unknown", async () => {
    const storage = seeded([1], null);
    let calls = 0;
    const out = await mergeLocalGame("pets", storage, now, async () => {
      calls++;
      return reply(200)();
    });
    assert.equal(out, "discarded");
    assert.equal(calls, 0);
    assert.deepEqual(createGameState(storage, now).getUsedGuesses(), []);
  });

  it("keeps local state and reports a rate limit", async () => {
    const storage = seeded([1], 427);
    assert.equal(
      await mergeLocalGame("pets", storage, now, reply(429)),
      "rate_limited",
    );
    assert.deepEqual(createGameState(storage, now).getUsedGuesses(), [1]);
  });

  it("keeps local state when the server is unreachable or fails", async () => {
    for (const f of [
      reply(500),
      async () => {
        throw new Error("offline");
      },
    ]) {
      const storage = seeded([1], 427);
      assert.equal(await mergeLocalGame("pets", storage, now, f), "error");
      assert.deepEqual(createGameState(storage, now).getUsedGuesses(), [1]);
    }
  });
});
