import assert from "node:assert/strict";
import { beforeEach, describe, it } from "vitest";
import { gradeIds } from "../src/game/game.ts";
import { ATTRIBUTES, GUESS_DATA, SLUG } from "./roster-fixture.ts";
import { createServerPlay } from "../src/game/server-play.ts";
import type { Fetch } from "../src/game/transport.ts";

const answer = GUESS_DATA[0]!;
const [, one, two] = GUESS_DATA;

// A fake of the /api/game routes holding one player's state
class FakeServer {
  day: number = 100;
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
      return reply(this.status, { error: "rate_limited" });
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
    const loaded = await play.load();
    assert.equal(loaded?.rows.length, 1);
    assert.equal(loaded?.victory, false);
    assert.deepEqual(play.getUsedGuesses(), [one!.id]);
  });

  it("carries the win and the answer", async () => {
    server.ids = [answer.id];
    const loaded = await open().load();
    assert.equal(loaded?.victory, true);
    assert.equal(loaded?.answer, answer.name);
  });

  it("carries a give-up", async () => {
    server.gaveUp = true;
    const loaded = await open().load();
    assert.equal(loaded?.gaveUp, true);
    assert.equal(loaded?.answer, answer.name);
  });

  it("is null when the server cannot be reached or errors", async () => {
    server.down = true;
    assert.equal(await open().load(), null);
    server.down = false;
    server.status = 500;
    assert.equal(await open().load(), null);
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
    assert.deepEqual(await play.submit(one!.id), { kind: "error" });
    server.down = false;
    server.status = 500;
    assert.deepEqual(await play.submit(one!.id), { kind: "error" });
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
    assert.deepEqual(await open().giveUp(), { kind: "error" });
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
