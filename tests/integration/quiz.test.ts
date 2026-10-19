import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";
import { createApp } from "../../src/server/app.ts";
import { MIGRATIONS_DIR } from "../../src/server/main.ts";
import { migrate } from "../../src/server/migrate.ts";
import { act } from "../../src/server/party-actions.ts";
import {
  findParty,
  playerByToken,
  viewsOf,
  type PartyRow,
} from "../../src/server/parties.ts";
import { startDb } from "./postgres.ts";
import type { TestDb } from "./postgres.ts";

const NOW = new Date("2026-10-18T10:00:00Z");

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Body = any;

// Quiz games (ADR 0021): questions as entries, the whole quiz graded at once, first scores
// counted, and one question per party round
describe("quiz games", () => {
  let db: TestDb;
  let server: Server;
  let url: string;
  let dir: string;
  let ann: string;

  const request = async (
    method: string,
    path: string,
    cookie?: string,
    body?: unknown,
  ): Promise<{ status: number; body: Body }> => {
    const res = await fetch(`${url}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(cookie && { Cookie: cookie }),
      },
      ...(body !== undefined && { body: JSON.stringify(body) }),
    });
    return { status: res.status, body: await res.json() };
  };
  const login = async (email: string): Promise<string> => {
    const res = await fetch(`${url}/api/test/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    return res.headers.get("set-cookie")!.split(";")[0]!;
  };
  const G = "/api/games/trivia";
  const CHOICE = {
    name: "Which planet is largest?",
    quiz: { options: ["Mars", "Jupiter", "Venus"], correct: 1 },
  };
  const NUMBER = {
    name: "In what year did the Berlin Wall fall?",
    quiz: { answer: "1989", range: "10" },
  };
  // Both questions added in order: their ids
  const addBoth = async (): Promise<[number, number]> => {
    await request("POST", `${G}/entries`, ann, CHOICE);
    const list = (await request("POST", `${G}/entries`, ann, NUMBER)).body;
    return [list[0].id, list[1].id];
  };
  const take = (answers: Record<string, string>, player = "a".repeat(20)) =>
    request("POST", `${G}/quiz`, undefined, { answers, player, seconds: 30 });

  beforeAll(async () => {
    db = await startDb();
    await migrate(db.pool, MIGRATIONS_DIR);
    dir = await mkdtemp(join(tmpdir(), "quiz-"));
    server = await new Promise<Server>((resolve) => {
      const s = createApp({
        pool: db.pool,
        now: () => NOW,
        random: () => 0,
        testLogin: true,
        uploadsDir: dir,
        writeLimit: { max: 1000, windowMs: 60_000 },
        uploadLimit: { max: 1000, windowMs: 60_000 },
      }).listen(0, "127.0.0.1", () => resolve(s));
    });
    url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(async () => {
    server.close();
    await db.stop();
    await rm(dir, { recursive: true, force: true });
  });
  beforeEach(async () => {
    await db.pool.query("delete from users");
    await db.pool.query("delete from games where slug <> 'petdle'");
    ann = await login("ann@example.test");
    await request("POST", "/api/games", ann, { name: "Trivia", kind: "quiz" });
  });

  it("saves questions with their answers, and has no attributes", async () => {
    assert.equal((await request("GET", `${G}/details`, ann)).body.kind, "quiz");
    assert.equal(
      (
        await request("POST", `${G}/attributes`, ann, {
          name: "Color",
          type: "text",
        })
      ).status,
      400,
    );
    const save = (body: Body) => request("POST", `${G}/entries`, ann, body);
    assert.equal((await save({ name: "Q?" })).body.error, "missing_answer");
    assert.equal(
      (await save({ name: "Q?", quiz: { options: ["A"], correct: 0 } })).status,
      400,
    );
    assert.equal(
      (await save({ name: "Q?", quiz: { options: ["A", "a"], correct: 0 } }))
        .status,
      400,
    );
    assert.equal(
      (await save({ name: "Q?", quiz: { answer: "x", range: "1" } })).status,
      400,
    );
    // A question may be long, and two may share their text
    const long = { ...CHOICE, name: "Why? ".repeat(50).trim() };
    assert.equal((await save(long)).status, 200);
    const list = (await save(long)).body;
    assert.equal(list.length, 2);
    assert.deepEqual(list[0].quiz, CHOICE.quiz);
    // A rename keeps the answer
    const renamed = await request("PATCH", `${G}/entries/${list[0].id}`, ann, {
      name: "Renamed",
    });
    assert.deepEqual(renamed.body[0].quiz, CHOICE.quiz);
    // Deleting one leaves the other
    const left = await request("DELETE", `${G}/entries/${list[1].id}`, ann);
    assert.equal(left.status, 200);
    assert.equal(left.body.length, 1);
    // A classic game takes no answer
    await request("POST", "/api/games", ann, { name: "Classic" });
    assert.equal(
      (await request("POST", "/api/games/classic/entries", ann, CHOICE)).status,
      400,
    );
  });

  it("shows players the questions without their answers, and has no days", async () => {
    const [choice, number] = await addBoth();
    const game = (await request("GET", G, ann)).body;
    assert.equal(game.kind, "quiz");
    assert.deepEqual(game.entries, []);
    assert.deepEqual(game.questions, [
      {
        id: choice,
        prompt: CHOICE.name,
        photo: "",
        options: CHOICE.quiz.options,
      },
      { id: number, prompt: NUMBER.name, photo: "", options: null },
    ]);
    assert.equal(JSON.stringify(game).includes("1989"), false);
    assert.equal((await request("GET", `${G}/days`, ann)).status, 404);
    assert.equal(
      (await request("POST", `${G}/grade`, ann, { ids: [choice] })).status,
      404,
    );
  });

  it("grades the whole quiz and counts each player's first score only", async () => {
    const [choice, number] = await addBoth();
    // Submitted so anyone can play it
    assert.equal((await request("POST", `${G}/submit`, ann, {})).status, 200);
    const first = await take({ [choice]: "1", [number]: "1994" });
    assert.equal(first.status, 200, JSON.stringify(first.body));
    assert.equal(first.body.score, 1.5);
    assert.equal(first.body.total, 2);
    assert.deepEqual(
      first.body.review.map((r: Body) => [r.yours, r.right, r.points]),
      [
        ["Jupiter", "Jupiter", 1],
        ["1994", "1989", 0.5],
      ],
    );
    assert.deepEqual(first.body.stats, {
      first: 1.5,
      players: 1,
      spread: [0, 1, 0],
    });
    // A retake with a full score still counts the first one
    const again = await take({ [choice]: "1", [number]: "1989" });
    assert.equal(again.body.score, 2);
    assert.equal(again.body.stats.first, 1.5);
    assert.equal(again.body.stats.players, 1);
    // Another player who answers nothing scores 0
    const blank = await take({}, "b".repeat(20));
    assert.equal(blank.body.score, 0);
    assert.deepEqual(blank.body.stats.spread, [1, 1, 0]);
    assert.equal(
      (
        await request("POST", `${G}/quiz`, undefined, {
          answers: {},
          player: "short",
        })
      ).status,
      400,
    );
  });

  it("is in the gallery with one question once approved", async () => {
    await request("POST", `${G}/entries`, ann, CHOICE);
    await db.pool.query(
      "update games set status = 'approved' where slug = 'trivia'",
    );
    const card = (await request("GET", "/api/games")).body.find(
      (g: Body) => g.slug === "trivia",
    );
    assert.equal(card.kind, "quiz");
    assert.equal(card.entryCount, 1);
    // No question has a picture, so no banner collage
    assert.deepEqual(card.photos, []);
  });

  it("makes its banner collage from the question pictures", async () => {
    await request("POST", `${G}/entries`, ann, CHOICE);
    await request("POST", `${G}/entries`, ann, NUMBER);
    const pic = `/uploads/${"a".repeat(32)}.webp`;
    await db.pool.query("update entries set photo_url = $1 where name = $2", [
      pic,
      NUMBER.name,
    ]);
    await db.pool.query(
      "update games set status = 'approved' where slug = 'trivia'",
    );
    const card = (await request("GET", "/api/games")).body.find(
      (g: Body) => g.slug === "trivia",
    );
    assert.deepEqual(card.photos, [pic]);
  });

  describe("a party", () => {
    const open = async (): Promise<{
      party: PartyRow;
      host: number;
      guest: number;
    }> => {
      const opened = await request("POST", `${G}/parties`, ann, {
        nickname: "Ann",
      });
      assert.equal(opened.status, 201, JSON.stringify(opened.body));
      const joined = await request(
        "POST",
        `/api/parties/${opened.body.code}/join`,
        undefined,
        { nickname: "Bo" },
      );
      const party = (await findParty(db.pool, opened.body.code, NOW))!;
      return {
        party,
        host: (await playerByToken(db.pool, party.id, opened.body.token))!,
        guest: (await playerByToken(db.pool, party.id, joined.body.token))!,
      };
    };
    const at = (s: number): Date => new Date(NOW.getTime() + s * 1000);

    it("plays the questions in order, hides answers until a round ends, and ranks by points then time", async () => {
      await addBoth();
      const { party, host, guest } = await open();
      const run = (who: number, msg: Body, s: number) =>
        act(db.pool, party, who, msg, at(s), () => 0);

      assert.equal(await run(host, { type: "start-round" }, 0), null);
      let view = (await viewsOf(db.pool, party, [guest])).get(guest)!;
      assert.equal(view.game.questions, 2);
      assert.equal(view.round!.question!.prompt, CHOICE.name);
      assert.equal(
        await run(guest, { type: "guess", entryId: 1 }, 1),
        "invalid",
      );
      assert.equal(
        await run(guest, { type: "answer", answer: "7" }, 1),
        "invalid",
      );
      // The guest is right but slow, the host wrong
      assert.equal(await run(host, { type: "answer", answer: "0" }, 2), null);
      view = (await viewsOf(db.pool, party, [guest])).get(guest)!;
      assert.deepEqual(
        view.round!.progress.map((p) => [p.answered, p.solved, p.lost]),
        [
          [true, false, false],
          [false, false, false],
        ],
      );
      assert.equal(await run(guest, { type: "answer", answer: "1" }, 5), null);
      // Everyone answered: the round ended by itself
      view = (await viewsOf(db.pool, party, [guest])).get(guest)!;
      assert.equal(view.round!.live, false);
      assert.equal(view.history[0]!.right, "Jupiter");
      assert.deepEqual(
        view.history[0]!.results.map((r) => [r.playerId, r.points, r.score]),
        [
          [guest, 2, 1],
          [host, 0, 0],
        ],
      );

      // Round 2: both close, the host closer
      assert.equal(await run(host, { type: "start-round" }, 10), null);
      await run(guest, { type: "answer", answer: "1980" }, 11);
      await run(host, { type: "answer", answer: "1990" }, 12);
      view = (await viewsOf(db.pool, party, [host])).get(host)!;
      assert.equal(view.history[0]!.answer.name, NUMBER.name);
      assert.deepEqual(
        view.history[0]!.results.map((r) => [r.playerId, r.points, r.score]),
        [
          [host, 2, 0.9],
          [guest, 1, 0.1],
        ],
      );
      assert.deepEqual(
        view.players.map((p) => [p.id, p.points]),
        [
          [guest, 3],
          [host, 2],
        ],
      );
      // No third question
      assert.equal(
        await run(host, { type: "start-round" }, 20),
        "no_questions_left",
      );
    });
  });
});
