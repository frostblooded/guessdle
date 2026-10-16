import assert from "node:assert/strict";
import { describe, it } from "node:test";
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

function seeded(ids: string[], day: number | null, gaveUp: boolean = false) {
  const storage = memory();
  const state = createGameState(storage, now);
  state.setUsedGuesses(ids);
  if (day !== null) {
    state.setDay(day);
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
    const out = await mergeLocalGame(memory(), now, async () => {
      calls++;
      return reply(200)();
    });
    assert.equal(out, "nothing");
    assert.equal(calls, 0);
  });

  it("posts day, ids and gaveUp, then clears local guess state", async () => {
    const storage = seeded(["a", "b"], 427, true);
    let sent: { url: string; body: unknown } | null = null;
    const out = await mergeLocalGame(storage, now, async (url, init) => {
      sent = { url, body: JSON.parse(init.body) };
      return reply(200)();
    });
    assert.equal(out, "merged");
    assert.deepEqual(sent, {
      url: "/api/game/merge",
      body: { day: 427, ids: ["a", "b"], gaveUp: true },
    });
    const state = createGameState(storage, now);
    assert.deepEqual(state.getUsedGuesses(), []);
    assert.equal(state.getDay(), null);
    assert.equal(state.getGaveUp(), false);
  });

  it("merges a stored give-up without guesses", async () => {
    const storage = seeded([], 427, true);
    assert.equal(await mergeLocalGame(storage, now, reply(200)), "merged");
  });

  for (const status of [409, 400]) {
    it(`discards local state on ${status} (server wins / unusable)`, async () => {
      const storage = seeded(["a"], 427);
      const out = await mergeLocalGame(storage, now, reply(status));
      assert.equal(out, "discarded");
      assert.deepEqual(createGameState(storage, now).getUsedGuesses(), []);
    });
  }

  it("clears without merging when the stored day is unknown", async () => {
    const storage = seeded(["a"], null);
    let calls = 0;
    const out = await mergeLocalGame(storage, now, async () => {
      calls++;
      return reply(200)();
    });
    assert.equal(out, "discarded");
    assert.equal(calls, 0);
    assert.deepEqual(createGameState(storage, now).getUsedGuesses(), []);
  });

  it("keeps local state when the server is unreachable or limits", async () => {
    for (const f of [
      reply(429),
      reply(500),
      async () => {
        throw new Error("offline");
      },
    ]) {
      const storage = seeded(["a"], 427);
      assert.equal(await mergeLocalGame(storage, now, f), "error");
      assert.deepEqual(createGameState(storage, now).getUsedGuesses(), ["a"]);
    }
  });
});
