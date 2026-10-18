import assert from "node:assert/strict";
import { FAILURES, UNREACHABLE } from "../src/game/failures.ts";
import { beforeEach, describe, it } from "vitest";
import { hintChoices } from "../src/game/free-hint.ts";
import { gradeIds } from "../src/game/game.ts";
import type { StateStorage } from "../src/game/game-state.ts";
import { createPlay, type Loaded, type LoadFailure } from "../src/game/play.ts";
import type { Fetch } from "../src/game/transport.ts";
import { ATTRIBUTES, GUESS_DATA, SLUG } from "./roster-fixture.ts";

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
  requests: number[][] = [];

  giveUps: number = 0;
  hints: { ids: number[]; kind: string }[] = [];
  urls: string[] = [];

  fetch: Fetch = async (fullUrl, init) => {
    this.urls.push(fullUrl);
    // A past day's query; this fake grades every day the same
    const url = fullUrl.replace(/\?day=\d+$/, "");
    assert.equal(init?.method, "POST");
    assert.equal(init?.headers["Content-Type"], "application/json");
    if (this.down) {
      throw new Error("offline");
    }
    if (url === `/api/games/${SLUG}/give-up`) {
      this.giveUps++;
      return {
        ok: true,
        status: 200,
        json: async () => ({ day: this.day, answer: answer.name }),
      };
    }
    if (url === `/api/games/${SLUG}/hint`) {
      this.hints.push(
        JSON.parse(init!.body) as { ids: number[]; kind: string },
      );
      return {
        ok: true,
        status: 200,
        json: async () => ({
          day: this.day,
          hint: { kind: "attribute", attribute: "Owner", value: "Niki" },
        }),
      };
    }
    assert.equal(url, `/api/games/${SLUG}/grade`);
    const ids = (JSON.parse(init!.body) as { ids: number[] }).ids;
    this.requests.push(ids);
    const graded = gradeIds(ATTRIBUTES, GUESS_DATA, answer, ids);
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
        ...(!graded.victory && {
          hints: hintChoices(ATTRIBUTES, answer, graded.rows) ?? undefined,
        }),
      }),
    };
  };
}

// The loaded game, failing the test if the load was refused
const loadedOf = async (play: {
  load(): Promise<Loaded | LoadFailure>;
}): Promise<Loaded> => {
  const loaded = await play.load();
  assert.ok(!("failure" in loaded), "load failed");
  return loaded;
};

let storage: MemoryStorage;
let server: FakeServer;
const open = () =>
  createPlay({
    slug: SLUG,
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

  it("rejects further guesses after the win without calling the server", async () => {
    const play = open();
    await play.submit(answer.id);
    server.requests = [];
    assert.deepEqual(await play.submit(one!.id), { kind: "finished" });
    assert.deepEqual(server.requests, []);
    assert.deepEqual(play.getUsedGuesses(), [answer.id]);
  });

  it("rejects an unknown id and a repeat without calling the server", async () => {
    const play = open();
    assert.deepEqual(await play.submit(999), { kind: "invalid" });
    await play.submit(one!.id);
    server.requests = [];
    assert.deepEqual(await play.submit(one!.id), { kind: "duplicate" });
    assert.deepEqual(server.requests, []);
    assert.deepEqual(play.getUsedGuesses(), [one!.id]);
  });

  it("stores nothing when the request fails", async () => {
    server.down = true;
    const play = open();
    assert.deepEqual(await play.submit(one!.id), {
      kind: "error",
      message: UNREACHABLE,
    });
    assert.deepEqual(play.getUsedGuesses(), []);
    server.down = false;
    assert.equal((await play.submit(one!.id)).kind, "accepted");
  });

  it("treats a server rejection as an error", async () => {
    server.fetch = async () => ({
      ok: false,
      status: 500,
      json: async () => ({ error: "server_error" }),
    });
    assert.deepEqual(await open().submit(one!.id), {
      kind: "error",
      message: FAILURES.server_error.text,
    });
  });

  it("reports a rate limit, JSON or nginx plain text, and keeps state", async () => {
    await open().submit(one!.id);
    for (const json of [
      async () => ({ error: "rate_limited" }),
      async (): Promise<never> => {
        throw new SyntaxError("not json");
      },
    ]) {
      server.fetch = async () => ({ ok: false, status: 429, json });
      const play = open();
      assert.deepEqual(await play.submit(two!.id), { kind: "rate_limited" });
      assert.deepEqual(await play.giveUp(), { kind: "rate_limited" });
      assert.deepEqual(play.getUsedGuesses(), [one!.id]);
      assert.equal(storage.getItem("gaveUp"), null);
    }
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
    const loaded = await loadedOf(open());
    assert.deepEqual(
      loaded?.rows.map((row) => row[1]!.value),
      [one!.name, two!.name],
    );
    assert.equal(loaded?.victory, false);
  });

  it("shows the victory and the answer when a stored guess is right", async () => {
    await open().submit(one!.id);
    await open().submit(answer.id);
    const loaded = await loadedOf(open());
    assert.equal(loaded?.victory, true);
    assert.equal(loaded?.answer, answer.name);
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

  it("keeps the stored guesses and reports the server as unreachable", async () => {
    await open().submit(one!.id);
    server.down = true;
    const play = open();
    assert.deepEqual(await play.load(), { failure: UNREACHABLE });
    assert.deepEqual(play.getUsedGuesses(), [one!.id]);
  });
});

const withHook = (onNewDay: () => void) =>
  createPlay({
    slug: SLUG,
    roster: GUESS_DATA,
    storage,
    now: () => MONDAY,
    fetch: server.fetch,
    onNewDay,
  });

describe("giveUp", () => {
  it("reveals the answer and keeps the guesses", async () => {
    const play = open();
    await play.submit(one!.id);
    assert.deepEqual(await play.giveUp(), {
      kind: "gaveUp",
      answer: answer.name,
    });
    assert.deepEqual(play.getUsedGuesses(), [one!.id]);
    assert.equal(storage.getItem("gaveUp"), "true");
  });

  it("works with no guesses made", async () => {
    assert.equal((await open().giveUp()).kind, "gaveUp");
  });

  it("finishes the game: guesses and a second give-up are refused", async () => {
    const play = open();
    await play.giveUp();
    server.requests = [];
    assert.deepEqual(await play.submit(one!.id), { kind: "finished" });
    assert.deepEqual(await play.giveUp(), { kind: "finished" });
    assert.deepEqual(server.requests, []);
    assert.equal(server.giveUps, 1);
  });

  it("is refused after a win", async () => {
    const play = open();
    await play.submit(answer.id);
    assert.deepEqual(await play.giveUp(), { kind: "finished" });
    assert.equal(server.giveUps, 0);
  });

  it("changes nothing when the request fails", async () => {
    const play = open();
    server.down = true;
    assert.deepEqual(await play.giveUp(), {
      kind: "error",
      message: UNREACHABLE,
    });
    assert.equal(storage.getItem("gaveUp"), null);
    server.down = false;
    assert.equal((await play.submit(one!.id)).kind, "accepted");
  });

  it("treats a server rejection as an error", async () => {
    server.fetch = async () => ({
      ok: false,
      status: 500,
      json: async () => ({ error: "server_error" }),
    });
    assert.deepEqual(await open().giveUp(), {
      kind: "error",
      message: FAILURES.server_error.text,
    });
  });

  it("starts over instead of revealing when the server is on a newer day", async () => {
    let started = 0;
    const play = withHook(() => started++);
    await play.submit(one!.id);
    server.day = 101;
    assert.deepEqual(await play.giveUp(), { kind: "newday" });
    assert.equal(started, 1);
    assert.deepEqual(play.getUsedGuesses(), []);
    assert.equal(storage.getItem("gaveUp"), null);
    assert.equal((await play.submit(two!.id)).kind, "accepted");
  });

  it("is restored on load with the graded rows and the answer", async () => {
    const first = open();
    await first.submit(one!.id);
    await first.giveUp();
    const play = open();
    const loaded = await loadedOf(play);
    assert.equal(loaded?.gaveUp, true);
    assert.equal(loaded?.victory, false);
    assert.equal(loaded?.answer, answer.name);
    assert.equal(loaded?.rows.length, 1);
    assert.deepEqual(await play.submit(two!.id), { kind: "finished" });
  });

  it("is restored on load even with no guesses", async () => {
    await open().giveUp();
    const loaded = await loadedOf(open());
    assert.deepEqual(
      [loaded?.gaveUp, loaded?.answer, loaded?.rows.length],
      [true, answer.name, 0],
    );
  });

  it("is forgotten on load when the server is on a newer day", async () => {
    await open().giveUp();
    server.day = 101;
    const play = open();
    assert.deepEqual(await play.load(), { rows: [], victory: false });
    assert.equal(storage.getItem("gaveUp"), null);
    assert.equal((await play.submit(one!.id)).kind, "accepted");
  });

  it("is forgotten when the local date changes", async () => {
    await open().giveUp();
    const next = createPlay({
      slug: SLUG,
      roster: GUESS_DATA,
      storage,
      now: () => new Date(2025, 9, 7, 12),
      fetch: server.fetch,
    });
    assert.deepEqual(await next.load(), { rows: [], victory: false });
    assert.equal((await next.submit(one!.id)).kind, "accepted");
  });

  it("keeps the stored give-up and reports the server as unreachable on load", async () => {
    await open().giveUp();
    server.down = true;
    assert.deepEqual(await open().load(), { failure: UNREACHABLE });
    assert.equal(storage.getItem("gaveUp"), "true");
  });
});

describe("reset", () => {
  it("after a win clears guesses and allows replay", async () => {
    const play = open();
    await play.submit(one!.id);
    await play.submit(answer.id);
    play.reset();
    assert.deepEqual(play.getUsedGuesses(), []);
    assert.equal(storage.getItem("day"), null);
    assert.equal((await play.submit(answer.id)).kind, "accepted");
    assert.equal((await loadedOf(open())).rows.length, 1);
  });

  it("after a give-up clears the finished state and allows replay", async () => {
    const play = open();
    await play.submit(one!.id);
    await play.giveUp();
    play.reset();
    assert.equal(storage.getItem("gaveUp"), null);
    assert.deepEqual(await open().load(), { rows: [], victory: false });
    assert.equal((await play.submit(one!.id)).kind, "accepted");
    assert.equal((await play.giveUp()).kind, "gaveUp");
  });

  it("works mid-game, keeping the same answer", async () => {
    const play = open();
    await play.submit(one!.id);
    assert.equal(play.reset(), true);
    assert.deepEqual(play.getUsedGuesses(), []);
    assert.equal((await play.submit(one!.id)).kind, "accepted");
    assert.equal((await play.submit(answer.id)).kind, "accepted");
  });

  it("is harmless on a fresh game", async () => {
    const play = open();
    play.reset();
    assert.deepEqual(await play.load(), { rows: [], victory: false });
  });
});

describe("day rollover", () => {
  it("tells the page when a submit finds a newer day, then plays it as the new day", async () => {
    let started = 0;
    const play = withHook(() => started++);
    await play.submit(one!.id);
    server.day = 101;
    assert.equal((await play.submit(two!.id)).kind, "accepted");
    assert.equal(started, 1);
    assert.deepEqual(play.getUsedGuesses(), [two!.id]);
  });

  it("tells the page when load finds a newer day", async () => {
    await open().submit(one!.id);
    server.day = 101;
    let started = 0;
    await withHook(() => started++).load();
    assert.equal(started, 1);
  });

  it("does not signal when the day is unchanged", async () => {
    let started = 0;
    const play = withHook(() => started++);
    await play.submit(one!.id);
    await play.submit(two!.id);
    assert.equal(started, 0);
  });
});

describe("a past day", () => {
  const TUESDAY = new Date(2025, 9, 7, 12);
  const openPast = (now: Date) =>
    createPlay({
      slug: SLUG,
      roster: GUESS_DATA,
      storage,
      now: () => now,
      fetch: server.fetch,
      day: 42,
    });

  it("grades and gives up against that day", async () => {
    const play = openPast(MONDAY);
    await play.submit(one!.id);
    await play.giveUp();
    assert.deepEqual(server.urls, [
      `/api/games/${SLUG}/grade?day=42`,
      `/api/games/${SLUG}/give-up?day=42`,
    ]);
  });

  it("keeps its guesses on later calendar days", async () => {
    await openPast(MONDAY).submit(one!.id);
    const loaded = await loadedOf(openPast(TUESDAY));
    assert.equal(loaded?.rows.length, 1);
  });

  it("remembers a win for the Past days list, and a reset forgets it", async () => {
    const play = openPast(MONDAY);
    await play.submit(answer.id);
    assert.equal(storage.getItem("victory"), "true");
    play.reset();
    assert.equal(storage.getItem("victory"), null);
  });
});

describe("takeHint", () => {
  const OWNER = { kind: "attribute", attribute: "Owner", value: "Niki" };

  it("is offered after 3 wrong guesses", async () => {
    const play = open();
    await play.submit(one!.id);
    const second = await play.submit(two!.id);
    assert.ok(second.kind === "accepted" && second.hints === undefined);
    const third = await play.submit(three!.id);
    assert.ok(third.kind === "accepted");
    assert.deepEqual(third.hints, { attribute: true, description: false });
  });

  it("sends the guesses and the kind, keeps the hint and stops the offer", async () => {
    const play = open();
    for (const entry of [one!, two!, three!]) {
      await play.submit(entry.id);
    }
    const res = await play.takeHint("attribute");
    assert.deepEqual(res, { kind: "hint", hint: OWNER });
    assert.deepEqual(server.hints, [
      { ids: [one!.id, two!.id, three!.id], kind: "attribute" },
    ]);
    assert.deepEqual(JSON.parse(storage.getItem("hint")!), OWNER);
    const next = await play.submit(GUESS_DATA[4]!.id);
    assert.ok(next.kind === "accepted" && next.hints === undefined);
  });

  it("is restored on load without the offer", async () => {
    const play = open();
    for (const entry of [one!, two!, three!]) {
      await play.submit(entry.id);
    }
    await play.takeHint("attribute");
    const loaded = await loadedOf(open());
    assert.deepEqual(loaded.hint, OWNER);
    assert.equal(loaded.hints, undefined);
  });

  it("is forgotten on reset", async () => {
    const play = open();
    for (const entry of [one!, two!, three!]) {
      await play.submit(entry.id);
    }
    await play.takeHint("attribute");
    play.reset();
    assert.equal(storage.getItem("hint"), null);
  });
});
