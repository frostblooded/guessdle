import assert from "node:assert/strict";
import { FAILURES, UNREACHABLE } from "../src/game/failures.ts";
import { beforeEach, describe, it } from "vitest";
import { gradeIds } from "../src/game/game.ts";
import { ATTRIBUTES, GUESS_DATA, SLUG } from "./roster-fixture.ts";
import {
  RATE_LIMITED,
  type Loaded,
  type LoadFailure,
} from "../src/game/play.ts";
import { createServerPlay } from "../src/game/server-play.ts";
import type { Fetch } from "../src/game/transport.ts";

const answer = GUESS_DATA[0]!;
const [, one, two] = GUESS_DATA;

// A fake of the /api/game routes holding one player's state
class FakeServer {
  day: number = 100;
  revision: number = 0;
  ids: number[] = [];
  gaveUp: boolean = false;
  down: boolean = false;
  status: number | null = null; // forces an error response
  plain: boolean = false; // the error body is not JSON, like nginx's 429
  calls: string[] = [];

  view() {
    const graded = gradeIds(ATTRIBUTES, GUESS_DATA, answer, this.ids);
    assert.equal(graded.kind, "graded");
    const g = graded as Extract<typeof graded, { kind: "graded" }>;
    return {
      day: this.day,
      revision: this.revision,
      ids: this.ids,
      rows: g.rows,
      victory: g.victory,
      gaveUp: this.gaveUp,
      ...((g.victory || this.gaveUp) && { answer: answer.name }),
    };
  }

  fetch: Fetch = async (fullUrl, init) => {
    const method = init?.method ?? "GET";
    this.calls.push(`${method} ${fullUrl}`);
    // A past day's query; this fake keeps one day
    const url = fullUrl.replace(/\?day=\d+$/, "");
    if (this.down) {
      throw new Error("offline");
    }
    const reply = (status: number, body: unknown) => ({
      ok: status < 400,
      status,
      json: async (): Promise<unknown> => {
        if (this.plain && status === this.status) {
          throw new SyntaxError("not json");
        }
        return body;
      },
    });
    if (this.status !== null) {
      return reply(this.status, {
        error: this.status === 429 ? "rate_limited" : "server_error",
      });
    }
    const finished = this.view().victory || this.gaveUp;
    if (url === `/api/games/${SLUG}/state`) {
      return reply(200, this.view());
    }
    if (url === `/api/games/${SLUG}/state/guess`) {
      const id = (JSON.parse(init!.body) as { id: number }).id;
      if (finished) {
        return reply(409, { error: "finished", day: this.day });
      }
      if (this.ids.includes(id)) {
        return reply(409, { error: "duplicate", day: this.day });
      }
      this.ids = [...this.ids, id];
      return reply(200, this.view());
    }
    if (url === `/api/games/${SLUG}/state/give-up`) {
      if (finished) {
        return reply(409, { error: "finished", day: this.day });
      }
      this.gaveUp = true;
      return reply(200, this.view());
    }
    assert.equal(url, `/api/games/${SLUG}/state/reset`);
    this.ids = [];
    this.gaveUp = false;
    return reply(200, this.view());
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

let server: FakeServer;
let newDays: number;
const open = () =>
  createServerPlay({
    slug: SLUG,
    fetch: server.fetch,
    onNewDay: () => newDays++,
  });

beforeEach(() => {
  server = new FakeServer();
  newDays = 0;
});

describe("load", () => {
  it("returns the stored game, and its ids feed getUsedGuesses", async () => {
    server.ids = [one!.id];
    const play = open();
    const loaded = await loadedOf(play);
    assert.equal(loaded.rows.length, 1);
    assert.equal(loaded.victory, false);
    assert.deepEqual(play.getUsedGuesses(), [one!.id]);
  });

  it("carries the win and the answer", async () => {
    server.ids = [answer.id];
    const loaded = await loadedOf(open());
    assert.equal(loaded.victory, true);
    assert.equal(loaded.answer, answer.name);
  });

  it("carries a give-up", async () => {
    server.gaveUp = true;
    const loaded = await loadedOf(open());
    assert.equal(loaded.gaveUp, true);
    assert.equal(loaded.answer, answer.name);
  });

  it("says why when the server cannot be reached or refuses", async () => {
    server.down = true;
    assert.deepEqual(await open().load(), { failure: UNREACHABLE });
    server.down = false;
    server.status = 500;
    assert.deepEqual(await open().load(), {
      failure: FAILURES.server_error.text,
    });
    server.status = 429;
    assert.deepEqual(await open().load(), {
      failure: RATE_LIMITED,
    });
  });
});

describe("load refusals", () => {
  it.each([
    [401, "unauthorized"],
    [404, "not_found"],
    [409, "game_paused"],
    [409, "not_enough_entries"],
  ] as const)("explains a %i %s reply", async (status, error) => {
    server.fetch = async () => ({
      ok: false,
      status,
      json: async () => ({ error }),
    });
    assert.deepEqual(await open().load(), {
      failure: FAILURES[error].text,
    });
  });

  it("does not blame the connection for an unknown error", async () => {
    server.fetch = async () => ({
      ok: false,
      status: 500,
      json: async () => ({}),
    });
    const loaded = await open().load();
    assert.ok("failure" in loaded);
    assert.match(loaded.failure, /did not explain/);
  });
});

describe("submit", () => {
  it("persists on the server and returns the new row", async () => {
    const play = open();
    await play.load();
    const result = await play.submit(one!.id);
    assert.equal(result.kind, "accepted");
    assert.deepEqual(server.ids, [one!.id]);
    assert.deepEqual(play.getUsedGuesses(), [one!.id]);
    if (result.kind === "accepted") {
      assert.equal(result.isAnswer, false);
      assert.equal(result.row[1]!.value, one!.name);
    }
  });

  it("reveals the answer on the winning guess, then reports finished", async () => {
    const play = open();
    const win = await play.submit(answer.id);
    assert.equal(win.kind === "accepted" && win.answer, answer.name);
    server.calls = [];
    assert.deepEqual(await play.submit(one!.id), { kind: "finished" });
    assert.deepEqual(server.calls, []);
  });

  it("maps a server duplicate and a server finished", async () => {
    const play = open();
    server.ids = [one!.id]; // another device guessed it; this page does not know
    assert.deepEqual(await play.submit(one!.id), { kind: "duplicate" });
    server.gaveUp = true; // another device gave up
    assert.deepEqual(await play.submit(two!.id), { kind: "finished" });
    server.calls = [];
    assert.deepEqual(await play.submit(two!.id), { kind: "finished" });
    assert.deepEqual(server.calls, []);
  });

  it("maps a server invalid", async () => {
    server.fetch = async () => ({
      ok: false,
      status: 400,
      json: async () => ({ error: "invalid" }),
    });
    assert.deepEqual(await open().submit(999), { kind: "invalid" });
  });

  it("is an error when the request fails, keeping state", async () => {
    const play = open();
    server.down = true;
    assert.deepEqual(await play.submit(one!.id), {
      kind: "error",
      message: UNREACHABLE,
    });
    server.down = false;
    server.status = 500;
    assert.deepEqual(await play.submit(one!.id), {
      kind: "error",
      message: FAILURES.server_error.text,
    });
    server.status = null;
    assert.equal((await play.submit(one!.id)).kind, "accepted");
  });

  it("reports a rate limit, with or without a JSON body, and keeps state", async () => {
    const play = open();
    await play.submit(one!.id);
    server.status = 429;
    assert.deepEqual(await play.submit(two!.id), { kind: "rate_limited" });
    assert.deepEqual(await play.giveUp(), { kind: "rate_limited" });
    server.plain = true;
    assert.deepEqual(await play.submit(two!.id), { kind: "rate_limited" });
    server.status = null;
    assert.deepEqual(play.getUsedGuesses(), [one!.id]);
    assert.equal((await play.submit(two!.id)).kind, "accepted");
  });

  it("clears the page when the server moved to a newer day", async () => {
    const play = open();
    await play.submit(one!.id);
    server.day = 101;
    server.ids = [];
    const result = await play.submit(two!.id);
    assert.equal(result.kind, "accepted");
    assert.equal(newDays, 1);
    assert.deepEqual(play.getUsedGuesses(), [two!.id]);
  });
});

describe("a changed answer", () => {
  const storage = new Map<string, string>();
  const openStored = (onAnswerChanged: () => void) =>
    createServerPlay({
      slug: SLUG,
      fetch: server.fetch,
      onNewDay: () => newDays++,
      onAnswerChanged,
      storage: {
        getItem: (key) => storage.get(key) ?? null,
        setItem: (key, value) => void storage.set(key, value),
        removeItem: (key) => void storage.delete(key),
      },
    });

  it("tells the page once when progress this browser saw was wiped", async () => {
    let changed = 0;
    await openStored(() => changed++).submit(one!.id);
    // The owner changed the answer: the server wiped the guesses
    server.revision = 1;
    server.ids = [];
    await loadedOf(openStored(() => changed++));
    assert.equal(changed, 1);
    assert.equal(newDays, 1);
    await loadedOf(openStored(() => changed++));
    assert.equal(changed, 1);
  });

  it("says nothing when the browser saw no progress", async () => {
    storage.clear();
    let changed = 0;
    await loadedOf(openStored(() => changed++));
    server.revision = 1;
    await loadedOf(openStored(() => changed++));
    assert.equal(changed, 0);
  });
});

describe("give up", () => {
  it("stores it and reveals the answer", async () => {
    const play = open();
    assert.deepEqual(await play.giveUp(), {
      kind: "gaveUp",
      answer: answer.name,
    });
    assert.equal(server.gaveUp, true);
    assert.deepEqual(await play.giveUp(), { kind: "finished" });
  });

  it("is an error when the request fails", async () => {
    server.down = true;
    assert.deepEqual(await open().giveUp(), {
      kind: "error",
      message: UNREACHABLE,
    });
  });

  it("is finished when another device already ended the game", async () => {
    server.ids = [answer.id];
    assert.deepEqual(await open().giveUp(), { kind: "finished" });
  });
});

describe("reset", () => {
  it("clears the server game and allows guessing again", async () => {
    const play = open();
    await play.submit(answer.id);
    assert.equal(await play.reset(), true);
    assert.deepEqual(server.ids, []);
    assert.deepEqual(play.getUsedGuesses(), []);
    assert.equal((await play.submit(one!.id)).kind, "accepted");
  });

  it("works mid-game and on an empty board", async () => {
    const play = open();
    assert.equal(await play.reset(), true);
    await play.submit(one!.id);
    assert.equal(await play.reset(), true);
    assert.deepEqual(server.ids, []);
    assert.deepEqual(play.getUsedGuesses(), []);
    assert.equal((await play.submit(one!.id)).kind, "accepted");
  });

  it("reports failure and keeps the finished game", async () => {
    const play = open();
    await play.submit(answer.id);
    server.down = true;
    assert.equal(await play.reset(), false);
    server.down = false;
    assert.deepEqual(await play.submit(one!.id), { kind: "finished" });
  });
});

describe("a past day", () => {
  it("names the day on every request", async () => {
    const play = createServerPlay({
      slug: SLUG,
      fetch: server.fetch,
      day: 42,
    });
    await play.load();
    await play.submit(one!.id);
    await play.giveUp();
    await play.reset();
    const base = `/api/games/${SLUG}/state`;
    assert.deepEqual(server.calls, [
      `GET ${base}?day=42`,
      `POST ${base}/guess?day=42`,
      `POST ${base}/give-up?day=42`,
      `POST ${base}/reset?day=42`,
    ]);
  });
});
