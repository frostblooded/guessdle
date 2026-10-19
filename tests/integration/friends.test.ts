import assert from "node:assert/strict";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";
import { createApp } from "../../src/server/app.ts";
import { quizFriendResults } from "../../src/server/friends.ts";
import { dayStats } from "../../src/server/results.ts";
import type { Mailer } from "../../src/server/mailer.ts";
import { MIGRATIONS_DIR } from "../../src/server/main.ts";
import { migrate } from "../../src/server/migrate.ts";
import { GAME, PET_IDS, pid } from "./petdle.ts";
import { startDb } from "./postgres.ts";
import type { TestDb } from "./postgres.ts";

// 2026-10-16 is Day Number 427; the backfill stores "bela" for it
const NOW = new Date("2026-10-16T10:00:00Z");
const ANSWER = pid("bela");
const OTHERS = PET_IDS.filter((id) => id !== ANSWER);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Body = any;
type Mail = Parameters<Mailer["send"]>[0];

describe("friends", () => {
  let db: TestDb;
  let server: Server;
  let url: string;
  const sent: Mail[] = [];

  const send = async (
    method: string,
    path: string,
    cookie: string | null,
    body?: unknown,
  ): Promise<{ status: number; body: Body }> => {
    const res = await fetch(`${url}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(cookie !== null && { Cookie: cookie }),
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
  const player = async (username: string | null, email: string) => {
    const cookie = await login(email);
    if (username) {
      await send("PUT", "/api/me/username", cookie, { username });
    }
    const { rows } = await db.pool.query<{ id: number }>(
      "select id::int from users where email = lower($1)",
      [email],
    );
    return { cookie, id: rows[0]!.id };
  };
  const ask = (cookie: string, query: string) =>
    send("POST", "/api/friends", cookie, { query });
  const list = async (cookie: string) =>
    (await send("GET", "/api/friends", cookie)).body;
  const originalGameId = async (): Promise<number> =>
    (
      await db.pool.query<{ id: number }>(
        "select id::int from games where slug = $1",
        [GAME],
      )
    ).rows[0]!.id;
  const names = (friends: { name: string }[]) => friends.map((f) => f.name);

  beforeAll(async () => {
    db = await startDb();
    await migrate(db.pool, MIGRATIONS_DIR);
    server = await new Promise<Server>((resolve) => {
      const s = createApp({
        pool: db.pool,
        now: () => NOW,
        testLogin: true,
        writeLimit: { max: 1000, windowMs: 60_000 },
        mail: {
          publicUrl: "https://guess.test",
          mailer: {
            async send(message: Mail): Promise<void> {
              sent.push(message);
            },
          },
        },
      }).listen(0, "127.0.0.1", () => resolve(s));
    });
    url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(async () => {
    server.close();
    await db.stop();
  });
  beforeEach(async () => {
    sent.length = 0;
    await db.pool.query("delete from game_results");
    await db.pool.query("delete from users");
  });

  it("sends a request by exact username or email, and the other accepts it", async () => {
    const ann = await player("ann", "ann@x.test");
    const bob = await player("bob", "bob@x.test");
    const cy = await player(null, "Cy@X.test");

    for (const query of ["bo", "BOB@x", "nobody@x.test", "ann"]) {
      const out = await ask(ann.cookie, query);
      assert.equal(
        out.body.error,
        query === "ann" ? "friend_self" : "player_not_found",
        query,
      );
    }
    assert.deepEqual((await ask(ann.cookie, "BOB")).body, { outcome: "sent" });
    assert.deepEqual((await ask(ann.cookie, " cy@x.TEST ")).body, {
      outcome: "sent",
    });
    assert.equal((await ask(ann.cookie, "bob")).body.error, "friend_exists");

    assert.deepEqual(names((await list(ann.cookie)).outgoing), [
      "bob",
      "cy@x.test",
    ]);
    assert.deepEqual(names((await list(bob.cookie)).incoming), ["ann"]);
    assert.equal(
      (await send("GET", "/api/me", bob.cookie)).body.user.friendRequests,
      1,
    );

    assert.equal(
      (await send("PUT", `/api/friends/${ann.id}`, bob.cookie)).status,
      200,
    );
    // Only the one asked can accept
    assert.equal(
      (await send("PUT", `/api/friends/${cy.id}`, ann.cookie)).body.error,
      "friend_request_not_found",
    );
    assert.deepEqual(await list(bob.cookie), {
      friends: [{ id: ann.id, name: "ann" }],
      incoming: [],
      outgoing: [],
    });
    assert.equal(
      (await send("GET", "/api/me", bob.cookie)).body.user.friendRequests,
      0,
    );
    assert.equal((await ask(bob.cookie, "ann")).body.error, "friend_exists");
  });

  it("asking someone who already asked you makes you friends", async () => {
    const ann = await player("ann", "ann@x.test");
    const bob = await player("bob", "bob@x.test");
    await ask(ann.cookie, "bob");
    assert.deepEqual((await ask(bob.cookie, "ann")).body, {
      outcome: "accepted",
    });
    assert.deepEqual(names((await list(ann.cookie)).friends), ["bob"]);
  });

  it("removing declines, cancels or unfriends, from either side", async () => {
    const ann = await player("ann", "ann@x.test");
    const bob = await player("bob", "bob@x.test");
    await ask(ann.cookie, "bob");
    await send("DELETE", `/api/friends/${ann.id}`, bob.cookie);
    assert.deepEqual(await list(ann.cookie), {
      friends: [],
      incoming: [],
      outgoing: [],
    });
    await ask(ann.cookie, "bob");
    await ask(bob.cookie, "ann");
    await send("DELETE", `/api/friends/${bob.id}`, ann.cookie);
    assert.deepEqual((await list(bob.cookie)).friends, []);
  });

  it("needs a signed-in, unbanned player, and hides banned ones", async () => {
    const ann = await player("ann", "ann@x.test");
    await player("bob", "bob@x.test");
    assert.equal((await send("GET", "/api/friends", null)).status, 401);
    assert.equal(
      (await send("POST", "/api/friends", null, { query: "bob" })).status,
      401,
    );
    for (const query of ["", 7, "x".repeat(300)]) {
      assert.equal(
        (await send("POST", "/api/friends", ann.cookie, { query })).body.error,
        "invalid",
      );
    }
    await db.pool.query(
      "update users set banned_at = now() where email = 'bob@x.test'",
    );
    assert.equal((await ask(ann.cookie, "bob")).body.error, "player_not_found");
    await db.pool.query(
      "update users set banned_at = now() where email = 'ann@x.test'",
    );
    assert.equal((await ask(ann.cookie, "bob")).body.error, "banned");
  });

  it("emails the request unless the other turned those emails off", async () => {
    const ann = await player("ann", "ann@x.test");
    const bob = await player("bob", "bob@x.test");
    await ask(ann.cookie, "bob@x.test");
    assert.equal(sent.length, 1);
    assert.equal(sent[0]!.to, "bob@x.test");
    assert.match(sent[0]!.subject, /ann sent you a friend request/);
    assert.match(sent[0]!.text, /https:\/\/guess\.test\/friends/);
    assert.match(sent[0]!.text, /https:\/\/guess\.test\/settings/);
    // Accepting by asking back mails nobody
    await ask(bob.cookie, "ann");
    assert.equal(sent.length, 1);

    const cy = await player("cyd", "cy@x.test");
    const settings = (await send("GET", "/api/settings/mail", cy.cookie)).body;
    assert.equal(settings.friends, true);
    await send("PUT", "/api/settings/mail", cy.cookie, {
      ...settings,
      friends: false,
    });
    await ask(ann.cookie, "cyd");
    assert.equal(sent.length, 1);
  });

  it("puts friends' first tries of the day in the stats, wins first", async () => {
    const ann = await player("ann", "ann@x.test");
    const bob = await player("bob", "bob@x.test");
    const cy = await player(null, "cy@x.test");
    const dee = await player("dee", "dee@x.test");
    const eve = await player("eve", "eve@x.test");
    for (const other of ["bob", "cy@x.test", "dee", "eve"]) {
      await ask(ann.cookie, other);
    }
    for (const friend of [bob, cy, dee]) {
      await send("PUT", `/api/friends/${ann.id}`, friend.cookie);
    }
    const gameId = await originalGameId();
    const result = (
      who: { id: number },
      won: boolean,
      guesses: number,
      seconds: number | null,
    ) =>
      db.pool.query(
        "insert into game_results (game_id, day, player, guesses, seconds, won) values ($1, '2026-10-16', $2, $3, $4, $5)",
        [gameId, `user:${who.id}`, guesses, seconds, won],
      );
    await result(bob, true, 3, 90);
    await result(cy, true, 1, 5);
    // Dee's first try failed
    await result(dee, false, 1, null);
    // Eve never accepted, so she is not a friend
    await result(eve, true, 1, 1);
    // Another day's result is not this day's
    await db.pool.query(
      "update game_results set day = '2026-10-15' where player = $1",
      [`user:${eve.id}`],
    );

    const stats = await dayStats(
      db.pool,
      { gameId, date: "2026-10-16", player: `user:${ann.id}` },
      427,
    );
    assert.deepEqual(stats.friends, [
      { name: "cy@x.test", won: true, guesses: 1, seconds: 5 },
      { name: "bob", won: true, guesses: 3, seconds: 90 },
      { name: "dee", won: false, guesses: 1, seconds: null },
    ]);
    // A banned friend leaves the list
    await db.pool.query("update users set banned_at = now() where id = $1", [
      bob.id,
    ]);
    const after = await dayStats(
      db.pool,
      { gameId, date: "2026-10-16", player: `user:${ann.id}` },
      427,
    );
    assert.deepEqual(names(after.friends!), ["cy@x.test", "dee"]);
    // An anonymous player has no friends list
    const anon = await send("POST", `/api/games/${GAME}/result`, null, {
      ids: [OTHERS[0], ANSWER],
      player: "aaaaaaaa-0000-4000-8000-000000000001",
    });
    assert.equal(anon.status, 200);
    assert.equal(anon.body.friends, undefined);
  });

  it("lists friends' first quiz scores, best first", async () => {
    const ann = await player("ann", "ann@x.test");
    const bob = await player("bob", "bob@x.test");
    const cy = await player("cyd", "cy@x.test");
    await ask(ann.cookie, "bob");
    await ask(ann.cookie, "cyd");
    await send("PUT", `/api/friends/${ann.id}`, bob.cookie);
    await send("PUT", `/api/friends/${ann.id}`, cy.cookie);
    const gameId = await originalGameId();
    await db.pool.query(
      `insert into quiz_results (game_id, player, score, seconds, created_at)
       values ($1, $2, 1.5, 40, now()), ($1, $3, 2, null, now())`,
      [gameId, `user:${bob.id}`, `user:${cy.id}`],
    );
    assert.deepEqual(await quizFriendResults(db.pool, ann.id, gameId), [
      { name: "cyd", score: 2, seconds: null },
      { name: "bob", score: 1.5, seconds: 40 },
    ]);
    await db.pool.query("delete from quiz_results");
  });
});
