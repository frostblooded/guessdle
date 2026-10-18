import assert from "node:assert/strict";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";
import { createApp } from "../../src/server/app.ts";
import { MIGRATIONS_DIR } from "../../src/server/main.ts";
import { migrate } from "../../src/server/migrate.ts";
import { startDb } from "./postgres.ts";
import type { TestDb } from "./postgres.ts";

const NOW = new Date("2026-10-16T10:00:00Z");
const SLUG = "zoo";

type Mail = { to: string; subject: string; text: string };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Body = any;

describe("approval flow", () => {
  let db: TestDb;
  let server: Server;
  let url: string;
  let sent: Mail[];
  let mailFails = false;

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
      ...(body !== undefined &&
        method !== "GET" && { body: JSON.stringify(body) }),
    });
    return { status: res.status, body: await res.json() };
  };
  const login = async (email: string, admin = false): Promise<string> => {
    const res = await fetch(`${url}/api/test/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, admin }),
    });
    return res.headers.get("set-cookie")!.split(";")[0]!;
  };
  // A game owned by ann with `entries` active entries
  const makeGame = async (
    status: string,
    entries = 2,
    slug = SLUG,
    created = "2026-10-01",
  ): Promise<void> => {
    await db.pool.query(
      `insert into games (slug, name, status, owner_id, start_date, updated_at)
       values ($1, $2, $3, (select id from users where email = 'ann@example.test'), '2026-10-16', $4)`,
      [slug, `Game ${slug}`, status, created],
    );
    for (let i = 0; i < entries; i++) {
      await db.pool.query(
        "insert into entries (game_id, name) select id, $1 from games where slug = $2",
        [`E${i}`, slug],
      );
    }
  };
  // Mails to anyone but ann, the owner of every test game
  const adminMails = (): Mail[] =>
    sent.filter((m) => m.to !== "ann@example.test");
  const ownerMails = (): Mail[] =>
    sent.filter((m) => m.to === "ann@example.test");
  const statusOf = async (slug = SLUG): Promise<string> =>
    (await db.pool.query("select status from games where slug = $1", [slug]))
      .rows[0].status;

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
              if (mailFails) {
                throw new Error("smtp down");
              }
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
  let ann: string;
  let admin: string;
  beforeEach(async () => {
    await db.pool.query("delete from users");
    await db.pool.query("delete from games where slug <> 'petdle'");
    sent = [];
    mailFails = false;
    ann = await login("ann@example.test");
    admin = await login("root@example.test", true);
  });

  describe("submit for approval", () => {
    it("moves a draft with 2 entries to pending and emails the admins once", async () => {
      await makeGame("draft");
      await login("root2@example.test", true);
      const res = await request("POST", `/api/games/${SLUG}/submit`, ann, {});
      assert.equal(res.status, 200);
      assert.equal(res.body.status, "pending");
      assert.equal(await statusOf(), "pending");
      assert.deepEqual(sent.map((m) => m.to).sort(), [
        "root2@example.test",
        "root@example.test",
      ]);
      assert.match(sent[0]!.subject, /Game zoo/);
      assert.match(sent[0]!.text, /https:\/\/guess\.test\/admin/);
      assert.match(sent[0]!.text, /https:\/\/guess\.test\/g\/zoo/);
    });

    it("refuses fewer than 2 active entries", async () => {
      await makeGame("draft", 1);
      const res = await request("POST", `/api/games/${SLUG}/submit`, ann, {});
      assert.deepEqual([res.status, res.body.error], [409, "too_few_entries"]);
      assert.equal(await statusOf(), "draft");
      assert.equal(sent.length, 0);
    });

    it("does not count soft-deleted entries", async () => {
      await makeGame("draft", 2);
      await db.pool.query(
        "update entries set deleted_at = now() where id = (select min(id) from entries where game_id = (select id from games where slug = 'zoo'))",
      );
      const res = await request("POST", `/api/games/${SLUG}/submit`, ann, {});
      assert.equal(res.body.error, "too_few_entries");
    });

    it("401s anonymous, 403s another user, 404s an unknown game", async () => {
      await makeGame("draft");
      const bob = await login("bob@example.test");
      assert.equal(
        (await request("POST", `/api/games/${SLUG}/submit`, undefined, {}))
          .status,
        404,
      );
      assert.equal(
        (await request("POST", `/api/games/${SLUG}/submit`, bob, {})).status,
        404,
      );
      assert.equal(
        (await request("POST", `/api/games/nope/submit`, ann, {})).status,
        404,
      );
      await db.pool.query("update games set status = 'approved'");
      assert.equal(
        (await request("POST", `/api/games/${SLUG}/submit`, undefined, {}))
          .status,
        401,
      );
      assert.equal(
        (await request("POST", `/api/games/${SLUG}/submit`, bob, {})).status,
        403,
      );
    });

    it("refuses a game that is already pending or approved, without a second email", async () => {
      await makeGame("pending");
      await makeGame("approved", 2, "apr");
      for (const slug of [SLUG, "apr"]) {
        const res = await request("POST", `/api/games/${slug}/submit`, ann, {});
        assert.deepEqual([res.status, res.body.error], [409, "invalid_state"]);
      }
      assert.equal(sent.length, 0);
    });

    it("lets an admin submit someone else's game", async () => {
      await makeGame("draft");
      assert.equal(
        (await request("POST", `/api/games/${SLUG}/submit`, admin, {})).status,
        200,
      );
    });

    it("still succeeds when mail fails or is down", async () => {
      await makeGame("draft");
      mailFails = true;
      const res = await request("POST", `/api/games/${SLUG}/submit`, ann, {});
      assert.equal(res.status, 200);
      assert.equal(await statusOf(), "pending");
    });
  });

  describe("unpublish", () => {
    it("moves an approved game to pending and emails the admins", async () => {
      await makeGame("approved");
      const res = await request(
        "POST",
        `/api/games/${SLUG}/unpublish`,
        ann,
        {},
      );
      assert.equal(res.status, 200);
      assert.equal(await statusOf(), "pending");
      assert.equal(sent.length, 1);
    });

    it("refuses games that are not approved and other users", async () => {
      await makeGame("draft");
      const bob = await login("bob@example.test");
      assert.equal(
        (await request("POST", `/api/games/${SLUG}/unpublish`, ann, {})).body
          .error,
        "invalid_state",
      );
      await db.pool.query("update games set status = 'approved'");
      assert.equal(
        (await request("POST", `/api/games/${SLUG}/unpublish`, bob, {})).status,
        403,
      );
    });
  });

  describe("email when a game enters pending", () => {
    // Fills every attribute, since an entry needs them all
    const addEntry = async (): Promise<unknown> => {
      const attrs: Body[] = (
        await request("GET", `/api/games/${SLUG}/attributes`, ann)
      ).body;
      return request("POST", `/api/games/${SLUG}/entries`, ann, {
        name: "New one",
        values: Object.fromEntries(attrs.map((a) => [a.id, "x"])),
      });
    };
    const patchName = (): Promise<unknown> =>
      request("PATCH", `/api/games/${SLUG}`, ann, { name: "Renamed" });

    it("sends nothing for edits of a draft", async () => {
      await makeGame("draft");
      await addEntry();
      await patchName();
      assert.equal(sent.length, 0);
    });

    it("sends nothing for edits of an already pending game", async () => {
      await makeGame("pending");
      await addEntry();
      await patchName();
      assert.equal(sent.length, 0);
    });

    it("sends one email when an edit resets an approved or rejected game", async () => {
      for (const from of ["approved", "rejected"]) {
        sent = [];
        await db.pool.query("delete from games where slug = $1", [SLUG]);
        await makeGame(from);
        await patchName();
        await patchName();
        assert.equal(await statusOf(), "pending", from);
        assert.equal(adminMails().length, 1, from);
      }
    });

    it("covers attribute and entry edits too", async () => {
      await makeGame("approved");
      await request("POST", `/api/games/${SLUG}/attributes`, ann, {
        name: "Color",
        type: "text",
      });
      assert.equal(adminMails().length, 1);
      await db.pool.query("update games set status = 'approved'");
      await addEntry();
      assert.equal(adminMails().length, 2);
      await db.pool.query("update games set status = 'rejected'");
      const id = (
        await db.pool.query(
          "select min(id)::int as id from entries where game_id = (select id from games where slug = 'zoo')",
        )
      ).rows[0].id;
      await request("DELETE", `/api/games/${SLUG}/entries/${id}`, ann);
      assert.equal(adminMails().length, 3);
    });
  });

  describe("email to the owner", () => {
    const approve = (): Promise<unknown> =>
      request("POST", `/api/admin/games/${SLUG}/approve`, admin, {});
    const reject = (): Promise<unknown> =>
      request("POST", `/api/admin/games/${SLUG}/reject`, admin, {
        reason: "Blurry photos",
      });
    const settings = (body: unknown, cookie = ann) =>
      request("PUT", "/api/settings/mail", cookie, body);
    const ON = { all: true, approved: true, rejected: true, review: true };

    it("mails the owner when an admin approves the game", async () => {
      await makeGame("pending");
      await approve();
      assert.deepEqual(
        sent.map((m) => m.to),
        ["ann@example.test"],
      );
      assert.match(sent[0]!.subject, /"Game zoo" is approved/);
      assert.match(sent[0]!.text, /https:\/\/guess\.test\/g\/zoo/);
      assert.match(sent[0]!.text, /https:\/\/guess\.test\/settings/);
    });

    it("mails the owner the reason when an admin rejects the game", async () => {
      await makeGame("pending");
      await reject();
      assert.equal(ownerMails().length, 1);
      assert.match(ownerMails()[0]!.text, /Reason: Blurry photos/);
    });

    it("mails the owner when an edit sends an approved game back for review", async () => {
      await makeGame("approved");
      await request("PATCH", `/api/games/${SLUG}`, ann, { name: "Renamed" });
      assert.equal(ownerMails().length, 1);
      assert.match(ownerMails()[0]!.subject, /"Renamed" is waiting/);
    });

    it("does not mail the owner for their own submit or unpublish", async () => {
      await makeGame("draft");
      await request("POST", `/api/games/${SLUG}/submit`, ann, {});
      await approve();
      sent = [];
      await request("POST", `/api/games/${SLUG}/unpublish`, ann, {});
      assert.equal(ownerMails().length, 0);
    });

    it("starts with every switch on", async () => {
      const res = await request("GET", "/api/settings/mail", ann);
      assert.deepEqual([res.status, res.body], [200, ON]);
    });

    it("saves the switches and honours them", async () => {
      const res = await settings({ ...ON, approved: false });
      assert.deepEqual(
        [res.status, res.body],
        [200, { ...ON, approved: false }],
      );
      await makeGame("pending");
      await approve();
      assert.equal(ownerMails().length, 0);
      await db.pool.query(
        "update games set status = 'pending' where slug = $1",
        [SLUG],
      );
      await reject();
      assert.equal(ownerMails().length, 1);
    });

    it("sends nothing while the master switch is off, and keeps the others", async () => {
      await settings({ ...ON, all: false });
      await makeGame("pending");
      await reject();
      assert.equal(ownerMails().length, 0);
      assert.deepEqual((await request("GET", "/api/settings/mail", ann)).body, {
        ...ON,
        all: false,
      });
    });

    it("keeps each user's switches to themselves", async () => {
      await settings({ ...ON, all: false }, admin);
      assert.deepEqual(
        (await request("GET", "/api/settings/mail", ann)).body,
        ON,
      );
    });

    it("refuses a partial or wrong-typed body and signed-out visitors", async () => {
      for (const body of [{ all: false }, { ...ON, review: "no" }, []]) {
        assert.equal((await settings(body)).status, 400);
      }
      assert.equal((await request("GET", "/api/settings/mail")).status, 401);
      assert.equal(
        (await request("PUT", "/api/settings/mail", undefined, ON)).status,
        401,
      );
    });
  });

  describe("admin queue", () => {
    it("lists pending games oldest first with the owner and entry count", async () => {
      await makeGame("pending", 2, "newer", "2026-10-05");
      await makeGame("pending", 3, "older", "2026-10-02");
      await makeGame("draft", 2, "dr");
      await makeGame("approved", 2, "ap");
      const res = await request("GET", "/api/admin/queue", admin);
      assert.equal(res.status, 200);
      assert.deepEqual(
        res.body.games.map((g: Body) => [g.slug, g.entryCount, g.owner]),
        [
          ["older", 3, "ann@example.test"],
          ["newer", 2, "ann@example.test"],
        ],
      );
    });

    it("is for admins only", async () => {
      assert.equal((await request("GET", "/api/admin/queue")).status, 401);
      assert.equal((await request("GET", "/api/admin/queue", ann)).status, 403);
    });

    it("shows the pending count to admins on /api/me and hides it from others", async () => {
      await makeGame("pending");
      assert.equal(
        (await request("GET", "/api/me", admin)).body.user.pending,
        1,
      );
      assert.equal(
        (await request("GET", "/api/me", ann)).body.user.pending,
        undefined,
      );
    });

    it("approves a pending game and clears an old reason", async () => {
      await makeGame("pending");
      await db.pool.query("update games set reject_reason = 'old'");
      const res = await request(
        "POST",
        `/api/admin/games/${SLUG}/approve`,
        admin,
        {},
      );
      assert.equal(res.status, 200);
      const { rows } = await db.pool.query(
        "select status, reject_reason from games where slug = $1",
        [SLUG],
      );
      assert.deepEqual(rows, [{ status: "approved", reject_reason: "" }]);
      assert.equal(adminMails().length, 0);
    });

    it("tells only the owner and admins the status and rejection reason", async () => {
      await makeGame("rejected");
      await db.pool.query("update games set reject_reason = 'Too vague'");
      const bob = await login("bob@example.test");
      const view = async (cookie?: string): Promise<Body> =>
        (await request("GET", `/api/games/${SLUG}`, cookie)).body;
      for (const cookie of [undefined, bob]) {
        const body = await view(cookie);
        assert.equal(body.name, "Game zoo");
        assert.equal(body.status, undefined);
        assert.equal(body.rejectReason, undefined);
      }
      for (const cookie of [ann, admin]) {
        const body = await view(cookie);
        assert.deepEqual(
          [body.status, body.rejectReason],
          ["rejected", "Too vague"],
        );
      }
    });

    it("lets only admins approve a pending game from its page, which leaves the queue", async () => {
      await makeGame("pending");
      const bob = await login("bob@example.test");
      const view = async (cookie?: string): Promise<Body> =>
        (await request("GET", `/api/games/${SLUG}`, cookie)).body;
      for (const cookie of [undefined, bob, ann]) {
        assert.equal((await view(cookie)).canApprove, false);
      }
      assert.equal((await view(admin)).canApprove, true);
      await request("POST", `/api/admin/games/${SLUG}/approve`, admin, {});
      assert.deepEqual(
        [(await view(admin)).status, (await view(admin)).canApprove],
        ["approved", false],
      );
      assert.deepEqual((await request("GET", "/api/admin/queue", admin)).body, {
        games: [],
      });
    });

    it("refuses to approve an already approved game, and non-admins with a clear error", async () => {
      await makeGame("approved");
      const path = `/api/admin/games/${SLUG}/approve`;
      assert.deepEqual(Object.values(await request("POST", path, admin, {})), [
        409,
        { error: "invalid_state" },
      ]);
      await db.pool.query("update games set status = 'pending'");
      assert.deepEqual(Object.values(await request("POST", path, ann, {})), [
        403,
        { error: "forbidden" },
      ]);
      assert.equal(await statusOf(), "pending");
    });

    it("rejects with a trimmed reason, and refuses a blank or oversized one", async () => {
      await makeGame("pending");
      const path = `/api/admin/games/${SLUG}/reject`;
      for (const reason of [undefined, "  ", 5, "x".repeat(501)]) {
        assert.equal(
          (await request("POST", path, admin, { reason })).status,
          400,
        );
      }
      assert.equal(await statusOf(), "pending");
      const res = await request("POST", path, admin, {
        reason: " too blurry ",
      });
      assert.equal(res.status, 200);
      const { rows } = await db.pool.query(
        "select status, reject_reason from games where slug = $1",
        [SLUG],
      );
      assert.deepEqual(rows, [
        { status: "rejected", reject_reason: "too blurry" },
      ]);
    });

    it("only reviews pending games, only for admins", async () => {
      await makeGame("draft");
      for (const action of ["approve", "reject"]) {
        const path = `/api/admin/games/${SLUG}/${action}`;
        const res = await request("POST", path, admin, { reason: "no" });
        assert.deepEqual([res.status, res.body.error], [409, "invalid_state"]);
        assert.equal((await request("POST", path, ann, {})).status, 403);
        assert.equal((await request("POST", path, undefined, {})).status, 401);
      }
      assert.equal(
        (await request("POST", "/api/admin/games/nope/approve", admin, {}))
          .status,
        404,
      );
    });

    it("deletes a game with everything under it", async () => {
      await makeGame("pending");
      const res = await request("DELETE", `/api/admin/games/${SLUG}`, admin);
      assert.equal(res.status, 200);
      assert.equal(
        (await db.pool.query("select 1 from games where slug = $1", [SLUG]))
          .rowCount,
        0,
      );
      assert.equal(
        (await db.pool.query("select 1 from entries where name = 'E0'"))
          .rowCount,
        0,
      );
      assert.equal(
        (await request("DELETE", `/api/admin/games/${SLUG}`, admin)).status,
        404,
      );
      assert.equal(
        (await request("DELETE", `/api/admin/games/petdle`, ann)).status,
        403,
      );
    });

    it("a rejected game submits again by a plain submit too", async () => {
      await makeGame("rejected");
      const res = await request("POST", `/api/games/${SLUG}/submit`, ann, {});
      assert.equal(res.status, 200);
      assert.equal(sent.length, 1);
    });
  });
});
