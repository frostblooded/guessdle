import assert from "node:assert/strict";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";
import { WebSocket } from "ws";
import { attachPartySockets, createApp } from "../../src/server/app.ts";
import { MIGRATIONS_DIR } from "../../src/server/main.ts";
import { migrate } from "../../src/server/migrate.ts";
import { sweepParties } from "../../src/server/parties.ts";
import type {
  ClientMessage,
  PartyView,
  ServerMessage,
} from "../../src/game/party.ts";
import { GAME, pid } from "./petdle.ts";
import { startDb } from "./postgres.ts";
import type { TestDb } from "./postgres.ts";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Body = any;

const START = new Date("2026-10-17T18:00:00Z");

describe("party mode", () => {
  let db: TestDb;
  let server: Server;
  let url: string;
  let clock: Date;
  const sockets: WebSocket[] = [];

  const send = async (
    path: string,
    body: unknown,
    cookie = "",
  ): Promise<{ status: number; body: Body }> => {
    const res = await fetch(`${url}${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
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
  const host = async (
    nickname = "Ana",
    slug = GAME,
  ): Promise<{ code: string; token: string; cookie: string }> => {
    const cookie = await login("host@x.test");
    const res = await send(`/api/games/${slug}/parties`, { nickname }, cookie);
    assert.equal(res.status, 201, JSON.stringify(res.body));
    return { ...res.body, cookie };
  };
  const join = async (code: string, nickname: string): Promise<string> => {
    const res = await send(`/api/parties/${code}/join`, { nickname });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    return res.body.token;
  };

  // A phone on the party socket: every message it got, and a wait for the next matching one
  interface Phone {
    ws: WebSocket;
    say(msg: ClientMessage): void;
    next(match?: (m: ServerMessage) => boolean): Promise<ServerMessage>;
    view(match?: (v: PartyView) => boolean | undefined): Promise<PartyView>;
    closed: Promise<number>;
  }
  const phone = async (
    code: string,
    token?: string,
    headers: Record<string, string> = {},
  ): Promise<Phone> => {
    const ws = new WebSocket(
      `${url.replace("http", "ws")}/api/parties/${code}/socket`,
      { headers },
    );
    sockets.push(ws);
    const inbox: ServerMessage[] = [];
    const waiters: (() => void)[] = [];
    ws.on("message", (data) => {
      inbox.push(JSON.parse(String(data)) as ServerMessage);
      waiters.splice(0).forEach((w) => w());
    });
    const closed = new Promise<number>((resolve) =>
      ws.on("close", (c) => resolve(c)),
    );
    await new Promise<void>((resolve, reject) => {
      ws.on("open", () => resolve());
      ws.on("error", reject);
    });
    ws.send(JSON.stringify({ type: "hello", ...(token && { token }) }));
    const next = async (
      match: (m: ServerMessage) => boolean = () => true,
    ): Promise<ServerMessage> => {
      for (;;) {
        const i = inbox.findIndex(match);
        if (i !== -1) {
          return inbox.splice(0, i + 1).at(-1)!;
        }
        await new Promise<void>((resolve) => waiters.push(resolve));
      }
    };
    return {
      ws,
      closed,
      say: (msg) => ws.send(JSON.stringify(msg)),
      next,
      view: async (match = () => true) =>
        (
          (await next(
            (m) => m.type === "view" && match(m.view) === true,
          )) as Extract<ServerMessage, { type: "view" }>
        ).view,
    };
  };
  const answerOf = async (code: string): Promise<number> =>
    (
      await db.pool.query<{ id: number }>(
        `select r.answer_entry_id::int as id from party_rounds r join parties p on p.id = r.party_id
         where p.code = $1 order by r.number desc limit 1`,
        [code],
      )
    ).rows[0]!.id;
  const setAnswer = (code: string, id: number): Promise<unknown> =>
    db.pool.query(
      `update party_rounds r set answer_entry_id = $2 from parties p
       where p.id = r.party_id and p.code = $1 and r.ended_at is null`,
      [code, id],
    );

  beforeAll(async () => {
    db = await startDb();
    await migrate(db.pool, MIGRATIONS_DIR);
    server = await new Promise<Server>((resolve) => {
      const app = createApp({
        pool: db.pool,
        now: () => clock,
        testLogin: true,
        limit: { max: 100_000, windowMs: 60_000 },
      });
      const s = app.listen(0, "127.0.0.1", () => resolve(s));
      attachPartySockets(s, app);
    });
    url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(async () => {
    sockets.forEach((ws) => ws.terminate());
    server.close();
    await db.stop();
  });
  beforeEach(async () => {
    sockets.splice(0).forEach((ws) => ws.terminate());
    await db.pool.query("delete from parties");
    await db.pool.query("delete from users");
    clock = START;
  });

  describe("opening a party", () => {
    it("needs a signed-in host and a nickname", async () => {
      const anon = await send(`/api/games/${GAME}/parties`, {
        nickname: "Ana",
      });
      assert.equal(anon.status, 401);
      const cookie = await login("host@x.test");
      for (const nickname of ["", "   ", "x".repeat(21), 5]) {
        const res = await send(
          `/api/games/${GAME}/parties`,
          { nickname },
          cookie,
        );
        assert.equal(res.status, 400, String(nickname));
      }
    });

    it("is a 404 on a game the host cannot play", async () => {
      const cookie = await login("host@x.test");
      const res = await send(
        "/api/games/nope/parties",
        { nickname: "A" },
        cookie,
      );
      assert.equal(res.status, 404);
    });

    it("gives a 4-letter code the visitor view shows in the lobby", async () => {
      const { code } = await host();
      assert.match(code, /^[A-HJ-NP-Z]{4}$/);
      const { status, body } = await send(`/api/parties/${code}`, undefined);
      assert.equal(status, 200);
      assert.equal(body.code, code);
      assert.equal(body.game.slug, GAME);
      assert.equal(body.game.entries.length, 19);
      assert.equal(body.ended, false);
      assert.equal(body.you, null);
      assert.equal(body.round, null);
      assert.deepEqual(
        body.players.map((p: Body) => [p.nickname, p.host, p.points]),
        [["Ana", true, 0]],
      );
      // Lower case works too; unknown codes are a 404
      assert.equal(
        (await send(`/api/parties/${code.toLowerCase()}`, undefined)).status,
        200,
      );
      assert.equal((await send("/api/parties/ZZZZ", undefined)).status, 404);
      assert.equal((await send("/api/parties/bad!", undefined)).status, 404);
    });

    it("caps open parties per host", async () => {
      for (let i = 0; i < 5; i++) {
        await host();
      }
      const cookie = await login("host@x.test");
      const res = await send(
        `/api/games/${GAME}/parties`,
        { nickname: "A" },
        cookie,
      );
      assert.deepEqual([res.status, res.body.error], [409, "too_many_parties"]);
    });
  });

  describe("joining", () => {
    it("refuses a nickname already taken, whatever its case", async () => {
      const { code } = await host("Ana");
      const res = await send(`/api/parties/${code}/join`, { nickname: "ana" });
      assert.deepEqual([res.status, res.body.error], [409, "nickname_taken"]);
    });

    it("refuses a full party", async () => {
      const { code } = await host();
      for (let i = 1; i < 30; i++) {
        await join(code, `P${i}`);
      }
      const res = await send(`/api/parties/${code}/join`, { nickname: "Late" });
      assert.deepEqual([res.status, res.body.error], [409, "party_full"]);
    });

    it("tells phones already in the party", async () => {
      const { code, token } = await host();
      const ana = await phone(code, token);
      await ana.view((v) => v.players.length === 1);
      await join(code, "Bo");
      const view = await ana.view((v) => v.players.length === 2);
      assert.deepEqual(
        view.players.map((p) => p.nickname),
        ["Ana", "Bo"],
      );
      assert.deepEqual(view.you, { playerId: view.players[0]!.id, host: true });
    });
  });

  describe("a round", () => {
    it("ranks by fewest guesses, then time, and gives placement points", async () => {
      const { code, token } = await host();
      const bo = await phone(code, await join(code, "Bo"));
      const cy = await phone(code, await join(code, "Cy"));
      const ana = await phone(code, token);
      await ana.view((v) => v.players.length === 3);
      ana.say({ type: "start-round" });
      await ana.view((v) => v.round?.live === true);
      await setAnswer(code, pid("bela"));

      // Bo solves in 2, Cy in 2 but later, Ana gives up
      clock = new Date(START.getTime() + 5000);
      bo.say({ type: "guess", entryId: pid("ati") });
      const counts = await ana.view((v) =>
        v.round?.progress.some((p) => p.guesses === 1),
      );
      // Live: others see counts, never guesses or rows
      assert.equal(counts.round!.yours!.rows.length, 0);
      assert.equal(counts.history.length, 0);
      assert.equal(counts.round!.yours!.answer, undefined);
      bo.say({ type: "guess", entryId: pid("bela") });
      const boView = await bo.view((v) => v.round?.yours?.solved);
      assert.equal(boView.round!.yours!.rows.length, 2);
      assert.equal(boView.round!.yours!.answer!.name, "Bela");
      cy.say({ type: "guess", entryId: pid("cookie") });
      await cy.view((v) => v.round?.yours?.rows.length === 1);
      clock = new Date(START.getTime() + 9000);
      cy.say({ type: "guess", entryId: pid("bela") });
      await cy.view((v) => v.round?.yours?.solved);
      // Still live until Ana is done
      ana.say({ type: "give-up" });
      const done = await ana.view((v) => v.round?.live === false);

      const [round] = done.history;
      assert.equal(round!.answer.name, "Bela");
      const name = (id: number): string =>
        done.players.find((p) => p.id === id)!.nickname;
      assert.deepEqual(
        round!.results.map((r) => [
          name(r.playerId),
          r.place,
          r.points,
          r.guesses,
        ]),
        [
          ["Bo", 1, 3, 2],
          ["Cy", 2, 2, 2],
          ["Ana", null, 0, 0],
        ],
      );
      assert.deepEqual(round!.results[0]!.guessNames, ["Ati", "Bela"]);
      assert.equal(round!.results[0]!.timeMs, 5000);
      assert.deepEqual(
        done.players.map((p) => [p.nickname, p.points, p.place]),
        [
          ["Bo", 3, 1],
          ["Cy", 2, 2],
          ["Ana", 0, 3],
        ],
      );
    });

    it("refuses a repeated guess, a guess after solving, and host actions from a guest", async () => {
      const { code, token } = await host();
      const bo = await phone(code, await join(code, "Bo"));
      const ana = await phone(code, token);
      bo.say({ type: "start-round" });
      assert.deepEqual(await bo.next((m) => m.type === "error"), {
        type: "error",
        error: "not_host",
      });
      ana.say({ type: "start-round" });
      await bo.view((v) => v.round?.live === true);
      const answer = await answerOf(code);
      const other = answer === 1 ? 2 : 1;
      bo.say({ type: "guess", entryId: other });
      await bo.view((v) => v.round?.yours?.rows.length === 1);
      bo.say({ type: "guess", entryId: other });
      assert.deepEqual(await bo.next((m) => m.type === "error"), {
        type: "error",
        error: "duplicate",
      });
      bo.say({ type: "guess", entryId: 9999 });
      assert.deepEqual(await bo.next((m) => m.type === "error"), {
        type: "error",
        error: "invalid",
      });
      bo.say({ type: "guess", entryId: answer });
      await bo.view((v) => v.round?.yours?.solved);
      bo.say({ type: "give-up" });
      assert.deepEqual(await bo.next((m) => m.type === "error"), {
        type: "error",
        error: "finished",
      });
    });

    it("gives a player one Free Hint after 3 wrong guesses", async () => {
      const { code, token } = await host();
      const bo = await phone(code, await join(code, "Bo"));
      const ana = await phone(code, token);
      ana.say({ type: "start-round" });
      await bo.view((v) => v.round?.live === true);
      await setAnswer(code, pid("bela"));
      bo.say({ type: "hint", kind: "attribute" });
      assert.deepEqual(await bo.next((m) => m.type === "error"), {
        type: "error",
        error: "no_hint",
      });
      for (const slug of ["ati", "cookie", "dido"]) {
        bo.say({ type: "guess", entryId: pid(slug) });
      }
      const offered = await bo.view((v) => v.round?.yours?.rows.length === 3);
      assert.equal(offered.round!.yours!.hints!.description, false);
      bo.say({ type: "hint", kind: "attribute" });
      const hinted = await bo.view((v) => v.round?.yours?.hint !== undefined);
      assert.equal(hinted.round!.yours!.hint!.kind, "attribute");
      assert.equal(hinted.round!.yours!.hints, undefined);
      bo.say({ type: "hint", kind: "attribute" });
      assert.deepEqual(await bo.next((m) => m.type === "error"), {
        type: "error",
        error: "no_hint",
      });
    });

    it("lets a late joiner play the live round, timed from its start", async () => {
      const { code, token } = await host();
      const ana = await phone(code, token);
      ana.say({ type: "start-round" });
      await ana.view((v) => v.round?.live === true);
      clock = new Date(START.getTime() + 60_000);
      const late = await phone(code, await join(code, "Late"));
      const seen = await late.view();
      assert.equal(seen.round!.live, true);
      assert.deepEqual(seen.round!.yours!.rows, []);
      late.say({ type: "guess", entryId: await answerOf(code) });
      await late.view((v) => v.round?.yours?.solved);
      ana.say({ type: "end-round" });
      const done = await ana.view((v) => v.round?.live === false);
      assert.equal(done.history[0]!.results[0]!.timeMs, 60_000);
      // Two players: the solver gets 2, the host (unsolved) 0
      assert.deepEqual(
        done.players.map((p) => [p.nickname, p.points]),
        [
          ["Late", 2],
          ["Ana", 0],
        ],
      );
    });

    it("draws a different answer for the next round, and adds the points up", async () => {
      const { code, token } = await host();
      const ana = await phone(code, token);
      const answers: number[] = [];
      for (let n = 1; n <= 3; n++) {
        ana.say({ type: "start-round" });
        await ana.view((v) => v.round?.number === n && v.round.live);
        answers.push(await answerOf(code));
        ana.say({ type: "guess", entryId: answers.at(-1)! });
        await ana.view((v) => v.round?.number === n && !v.round.live);
      }
      assert.equal(new Set(answers).size, 3);
      const view = await (await phone(code, token)).view();
      assert.equal(view.history.length, 3);
      assert.deepEqual(
        view.history.map((r) => r.number),
        [3, 2, 1],
      );
      assert.equal(view.players[0]!.points, 3);
    });
  });

  describe("the host", () => {
    it("removes a player, whose phone is told and whose points leave the board", async () => {
      const { code, token } = await host();
      const bo = await phone(code, await join(code, "Bo"));
      const ana = await phone(code, token);
      const lobby = await ana.view((v) => v.players.length === 2);
      const boId = lobby.players.find((p) => p.nickname === "Bo")!.id;
      ana.say({ type: "remove-player", playerId: boId });
      assert.deepEqual(await bo.next((m) => m.type === "removed"), {
        type: "removed",
      });
      assert.equal(await bo.closed, 4001);
      const after = await ana.view((v) => v.players.length === 1);
      assert.equal(after.players[0]!.nickname, "Ana");
      // The host cannot be removed; the nickname is free again
      ana.say({ type: "remove-player", playerId: after.you!.playerId });
      assert.equal(
        ((await ana.next((m) => m.type === "error")) as Body).error,
        "invalid",
      );
      await join(code, "Bo");
    });

    it("ends a live round once a removal leaves everyone done", async () => {
      const { code, token } = await host();
      await join(code, "Bo");
      const ana = await phone(code, token);
      ana.say({ type: "start-round" });
      const live = await ana.view((v) => v.round?.live === true);
      ana.say({ type: "give-up" });
      await ana.view((v) => v.round?.yours?.gaveUp);
      const boId = live.players.find((p) => p.nickname === "Bo")!.id;
      ana.say({ type: "remove-player", playerId: boId });
      await ana.view((v) => v.round?.live === false);
    });

    it("ends the party: the link keeps the read-only results", async () => {
      const { code, token } = await host();
      const bo = await phone(code, await join(code, "Bo"));
      const ana = await phone(code, token);
      ana.say({ type: "start-round" });
      await ana.view((v) => v.round?.live === true);
      ana.say({ type: "end-party" });
      const ended = await bo.view((v) => v.ended);
      assert.equal(ended.round!.live, false);
      assert.equal(ended.history.length, 1);
      bo.say({ type: "give-up" });
      assert.equal(
        ((await bo.next((m) => m.type === "error")) as Body).error,
        "party_ended",
      );
      const res = await send(`/api/parties/${code}/join`, { nickname: "Cy" });
      assert.deepEqual([res.status, res.body.error], [409, "party_ended"]);
      const results = await send(`/api/parties/${code}`, undefined);
      assert.equal(results.body.ended, true);
      assert.equal(results.body.history.length, 1);
    });

    it("is recognised on another device by the session, without the token", async () => {
      const { code, cookie } = await host();
      const view = await (
        await phone(code, undefined, { Cookie: cookie })
      ).view();
      assert.equal(view.you!.host, true);
      const visitor = await (await phone(code)).view();
      assert.equal(visitor.you, null);
    });
  });

  describe("the socket", () => {
    it("refuses a cross-site origin and an unknown party", async () => {
      const { code } = await host();
      await assert.rejects(
        phone(code, undefined, { Origin: "https://evil.example" }),
        /403/,
      );
      await assert.rejects(phone("ZZZZ"), /404/);
    });

    it("rejoins a dropped phone as the same player, guesses kept", async () => {
      const { code, token } = await host();
      const ana = await phone(code, token);
      ana.say({ type: "start-round" });
      await ana.view((v) => v.round?.live === true);
      const answer = await answerOf(code);
      ana.say({ type: "guess", entryId: answer === 1 ? 2 : 1 });
      await ana.view((v) => v.round?.yours?.rows.length === 1);
      ana.ws.terminate();
      const again = await (await phone(code, token)).view();
      assert.equal(again.round!.yours!.rows.length, 1);
    });

    it("refuses actions from a visitor", async () => {
      const { code } = await host();
      const visitor = await phone(code);
      visitor.say({ type: "start-round" });
      assert.equal(
        ((await visitor.next((m) => m.type === "error")) as Body).error,
        "not_player",
      );
    });
  });

  describe("lifetime", () => {
    it("ends a party idle for 12 hours and deletes it 30 days after", async () => {
      const { code, token } = await host();
      const ana = await phone(code, token);
      ana.say({ type: "start-round" });
      await ana.view((v) => v.round?.live === true);
      clock = new Date(START.getTime() + 13 * 3600_000);
      const idle = await send(`/api/parties/${code}`, undefined);
      assert.equal(idle.body.ended, true);
      assert.equal(idle.body.round.live, false);
      await sweepParties(
        db.pool,
        new Date(START.getTime() + 29 * 24 * 3600_000),
      );
      assert.equal((await send(`/api/parties/${code}`, undefined)).status, 200);
      await sweepParties(
        db.pool,
        new Date(START.getTime() + 31 * 24 * 3600_000),
      );
      assert.equal((await send(`/api/parties/${code}`, undefined)).status, 404);
    });
  });
});
