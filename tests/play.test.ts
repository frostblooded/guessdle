import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { gradeIds } from "../src/game/game.ts";
import type { StateStorage } from "../src/game/game-state.ts";
import { createPlay, type FetchLike } from "../src/game/play.ts";
import { GUESS_DATA } from "../src/game/roster.ts";

class MemoryStorage implements StateStorage {
  readonly items: Map<string, string> = new Map();
  getItem(key: string): string | null {
    return this.items.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.items.set(key, value);
  }
  removeItem(key: string): void {
    this.items.delete(key);
  }
}

const answer = GUESS_DATA[0]!;
const [, one, two, three] = GUESS_DATA;
const MONDAY = new Date(2025, 9, 6, 12);

// A fake of POST /api/grade backed by the real grading core
class FakeServer {
  day: number = 100;
  down: boolean = false;
  requests: string[][] = [];

  fetch: FetchLike = async (url, init) => {
    assert.equal(url, "/api/grade");
    assert.equal(init.method, "POST");
    assert.equal(init.headers["Content-Type"], "application/json");
    if (this.down) {
      throw new Error("offline");
    }
    const ids = (JSON.parse(init.body) as { ids: string[] }).ids;
    this.requests.push(ids);
    const graded = gradeIds(GUESS_DATA, answer, ids);
    if (graded.kind !== "graded") {
      return {
        ok: false,
        status: graded.kind === "invalid" ? 400 : 409,
        json: async () => ({ error: graded.kind, day: this.day }),
      };
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({
        day: this.day,
        rows: graded.rows,
        victory: graded.victory,
        ...(graded.victory && { answer: answer.name }),
      }),
    };
  };
}

let storage: MemoryStorage;
let server: FakeServer;
const open = () =>
  createPlay({
    roster: GUESS_DATA,
    storage,
    now: () => MONDAY,
    fetch: server.fetch,
  });

beforeEach(() => {
  storage = new MemoryStorage();
  server = new FakeServer();
});

describe("submit", () => {
  it("grades on the server and stores the id", async () => {
    const play = open();
    const result = await play.submit(one!.id);
    assert.equal(result.kind, "accepted");
    if (result.kind !== "accepted") {
      return;
    }
    assert.equal(result.isAnswer, false);
    assert.equal(result.answer, undefined);
    assert.equal(result.row[1]!.value, one!.name);
    assert.deepEqual(play.getUsedGuesses(), [one!.id]);
    assert.deepEqual(JSON.parse(storage.getItem("usedGuesses")!), [one!.id]);
    assert.equal(storage.getItem("day"), "100");
  });

  it("sends earlier guesses with the new one, new one last", async () => {
    const play = open();
    await play.submit(one!.id);
    await play.submit(two!.id);
    assert.deepEqual(server.requests, [[one!.id], [one!.id, two!.id]]);
  });

  it("reveals the answer on the right guess", async () => {
    const result = await open().submit(answer.id);
    assert.equal(
      result.kind === "accepted" && result.isAnswer && result.answer,
      answer.name,
    );
  });

  it("does not call the answer again after a later guess", async () => {
    const play = open();
    await play.submit(answer.id);
    const result = await play.submit(one!.id);
    assert.equal(result.kind === "accepted" && result.isAnswer, false);
  });

  it("rejects an unknown id and a repeat without calling the server", async () => {
    const play = open();
    assert.deepEqual(await play.submit("nope"), { kind: "invalid" });
    await play.submit(one!.id);
    server.requests = [];
    assert.deepEqual(await play.submit(one!.id), { kind: "duplicate" });
    assert.deepEqual(server.requests, []);
    assert.deepEqual(play.getUsedGuesses(), [one!.id]);
  });

  it("stores nothing when the request fails", async () => {
    server.down = true;
    const play = open();
    assert.deepEqual(await play.submit(one!.id), { kind: "error" });
    assert.deepEqual(play.getUsedGuesses(), []);
    server.down = false;
    assert.equal((await play.submit(one!.id)).kind, "accepted");
  });

  it("treats a server rejection as an error", async () => {
    server.fetch = async () => ({
      ok: false,
      status: 429,
      json: async () => ({ error: "rate_limited" }),
    });
    assert.deepEqual(await open().submit(one!.id), { kind: "error" });
  });

  it("starts over when the server is on a newer day than the stored guesses", async () => {
    const play = open();
    await play.submit(one!.id);
    await play.submit(two!.id);
    server.day = 101;
    server.requests = [];
    const result = await play.submit(three!.id);
    assert.equal(result.kind, "accepted");
    assert.deepEqual(play.getUsedGuesses(), [three!.id]);
    assert.deepEqual(server.requests.at(-1), [three!.id]);
    assert.equal(storage.getItem("day"), "101");
  });
});

describe("load", () => {
  it("is empty without a request when nothing is stored", async () => {
    assert.deepEqual(await open().load(), {
      rows: [],
      victory: false,
    });
    assert.deepEqual(server.requests, []);
  });

  it("regrades stored guesses, oldest first", async () => {
    await open().submit(one!.id);
    await open().submit(two!.id);
    const loaded = await open().load();
    assert.deepEqual(
      loaded?.rows.map((row) => row[1]!.value),
      [one!.name, two!.name],
    );
    assert.equal(loaded?.victory, false);
  });

  it("shows the victory and the answer when a stored guess is right", async () => {
    await open().submit(one!.id);
    await open().submit(answer.id);
    const loaded = await open().load();
    assert.equal(loaded?.victory, true);
    assert.equal(loaded?.answer, answer.name);
  });

  it("upgrades display names stored before ids and drops unknown ones", async () => {
    storage.setItem("lastPlayed", JSON.stringify("2025-10-6"));
    storage.setItem(
      "usedGuesses",
      JSON.stringify([two!.name, "Gone Pet", one!.id]),
    );
    const play = open();
    assert.deepEqual(play.getUsedGuesses(), [two!.id, one!.id]);
    const loaded = await play.load();
    assert.deepEqual(
      loaded?.rows.map((row) => row[1]!.value),
      [two!.name, one!.name],
    );
    assert.deepEqual(JSON.parse(storage.getItem("usedGuesses")!), [
      two!.id,
      one!.id,
    ]);
    assert.equal(storage.getItem("day"), "100");
  });

  it("clears other-day name state without asking the server", async () => {
    storage.setItem("lastPlayed", JSON.stringify("2025-10-5"));
    storage.setItem("usedGuesses", JSON.stringify([two!.name]));
    const play = open();
    assert.deepEqual(play.getUsedGuesses(), []);
    assert.deepEqual(await play.load(), { rows: [], victory: false });
    assert.deepEqual(server.requests, []);
  });

  it("clears stored guesses graded on an older server day", async () => {
    await open().submit(one!.id);
    server.day = 101;
    const play = open();
    assert.deepEqual(await play.load(), { rows: [], victory: false });
    assert.deepEqual(play.getUsedGuesses(), []);
  });

  it("keeps the stored guesses and returns null when the server is down", async () => {
    await open().submit(one!.id);
    server.down = true;
    const play = open();
    assert.equal(await play.load(), null);
    assert.deepEqual(play.getUsedGuesses(), [one!.id]);
  });
});
