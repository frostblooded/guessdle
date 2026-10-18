import assert from "node:assert/strict";
import { describe, it } from "vitest";
import type pg from "pg";
import type { GameRow, GameStatus } from "../src/server/games.ts";
import {
  enteredPending,
  gameLifecycle,
  moveTarget,
  RESETS_STATUS,
  statusAfterEdit,
  type EditKind,
} from "../src/server/lifecycle.ts";
import type { MailConfig } from "../src/server/mailer.ts";

const STATUSES: GameStatus[] = ["draft", "pending", "approved", "rejected"];
const KINDS = Object.keys(RESETS_STATUS) as EditKind[];

describe("which edit kinds reset which statuses", () => {
  const resets = {
    draft: "draft",
    pending: "pending",
    approved: "pending",
    rejected: "pending",
  } as const;
  const keeps = {
    draft: "draft",
    pending: "pending",
    approved: "approved",
    rejected: "rejected",
  } as const;
  // Expected values are written out, not derived from RESETS_STATUS
  const table: Record<EditKind, Record<GameStatus, GameStatus>> = {
    details: resets,
    cover: resets,
    attributes: resets,
    entries: resets,
    "skip-period": keeps,
  };
  for (const kind of KINDS) {
    for (const status of STATUSES) {
      it(`${kind} on ${status} gives ${table[kind][status]}`, () => {
        assert.equal(statusAfterEdit(status, kind), table[kind][status]);
      });
    }
  }
});

describe("moves", () => {
  it("submit applies to draft and rejected only", () => {
    assert.deepEqual(
      STATUSES.map((s) => moveTarget("submit", s)),
      ["pending", undefined, undefined, "pending"],
    );
  });
  it("unpublish applies to approved only", () => {
    assert.deepEqual(
      STATUSES.map((s) => moveTarget("unpublish", s)),
      [undefined, undefined, "pending", undefined],
    );
  });
  it("approve and reject apply to pending only", () => {
    assert.deepEqual(
      STATUSES.map((s) => moveTarget("approve", s)),
      [undefined, "approved", undefined, undefined],
    );
    assert.deepEqual(
      STATUSES.map((s) => moveTarget("reject", s)),
      [undefined, "rejected", undefined, undefined],
    );
  });
  it("only a change into pending counts as entering it", () => {
    assert.equal(enteredPending("approved", "pending"), true);
    assert.equal(enteredPending("pending", "pending"), false);
    assert.equal(enteredPending("draft", "draft"), false);
    assert.equal(enteredPending("pending", "approved"), false);
  });
});

// A scripted pool: the game is at `status`; records the statements and the mails
function fake(status: GameStatus, entryCount: number = 2) {
  const log: string[] = [];
  const sent: string[] = [];
  const run = (sql: string): { rows: unknown[]; rowCount: number } => {
    log.push(sql.trim().split(/\s+/).slice(0, 2).join(" "));
    if (sql.includes("for update")) {
      return { rows: [{ status }], rowCount: 1 };
    }
    if (sql.includes("returning slug")) {
      return { rows: [{ slug: "pets", name: "Pets" }], rowCount: 1 };
    }
    if (sql.includes("count(*)")) {
      return { rows: [{ n: entryCount }], rowCount: 1 };
    }
    if (sql.includes("from users where admin")) {
      return {
        rows: [{ email: "a@x.test" }, { email: "b@x.test" }],
        rowCount: 2,
      };
    }
    return { rows: [], rowCount: 0 };
  };
  const client = { query: async (sql: string) => run(sql), release: () => {} };
  const pool = {
    connect: async () => client,
    query: async (sql: string) => run(sql),
  } as unknown as pg.Pool;
  const mail: MailConfig = {
    publicUrl: "https://x.test",
    mailer: { send: async (m) => void sent.push(m.to) },
  };
  return { pool, mail, log, sent };
}

const game = { id: 1, slug: "pets", name: "Pets" } as GameRow;

describe("gameLifecycle.edit", () => {
  it("mails every admin once when an approved game is reset to pending", async () => {
    const f = fake("approved");
    await gameLifecycle(f.pool, f.mail).edit(game, "entries", async () => "x");
    assert.deepEqual(f.sent, ["a@x.test", "b@x.test"]);
    assert.ok(f.log.includes("commit"));
  });
  for (const status of ["draft", "pending"] as const) {
    it(`does not mail for an edit of a ${status} game`, async () => {
      const f = fake(status);
      await gameLifecycle(f.pool, f.mail).edit(game, "details", async () => 1);
      assert.deepEqual(f.sent, []);
    });
  }
  it("does not mail for a skip-period-only edit of an approved game", async () => {
    const f = fake("approved");
    await gameLifecycle(f.pool, f.mail).edit(
      game,
      "skip-period",
      async () => 1,
    );
    assert.deepEqual(f.sent, []);
  });
  it("does not mail or touch the status when the work was a no-op", async () => {
    const f = fake("approved");
    await gameLifecycle(f.pool, f.mail).edit(
      game,
      "attributes",
      async () => "noop",
      (r) => r === "ok",
    );
    assert.deepEqual(f.sent, []);
    assert.ok(!f.log.includes("update games"));
  });
  it("rolls back and rethrows when the work throws, without mailing", async () => {
    const f = fake("approved");
    await assert.rejects(
      gameLifecycle(f.pool, f.mail).edit(game, "entries", async () => {
        throw new Error("boom");
      }),
      /boom/,
    );
    assert.ok(f.log.includes("rollback"));
    assert.deepEqual(f.sent, []);
  });
  it("never fails the edit when the mailer throws", async () => {
    const f = fake("approved");
    f.mail.mailer.send = async () => {
      throw new Error("smtp down");
    };
    const log = console.error;
    console.error = () => {};
    try {
      assert.equal(
        await gameLifecycle(f.pool, f.mail).edit(game, "cover", async () => 7),
        7,
      );
    } finally {
      console.error = log;
    }
  });
  it("works without mail configured", async () => {
    const f = fake("approved");
    assert.equal(
      await gameLifecycle(f.pool).edit(game, "cover", async () => 1),
      1,
    );
  });
});

describe("gameLifecycle.move", () => {
  const mailed = async (
    status: GameStatus,
    move: "submit" | "unpublish" | "approve" | "reject",
  ) => {
    const f = fake(status);
    const out = await gameLifecycle(f.pool, f.mail).move(game, move, "why");
    return [out, f.sent.length] as const;
  };
  it("submit and unpublish mail the admins, approve and reject do not", async () => {
    assert.deepEqual(await mailed("draft", "submit"), ["ok", 2]);
    assert.deepEqual(await mailed("approved", "unpublish"), ["ok", 2]);
    assert.deepEqual(await mailed("pending", "approve"), ["ok", 0]);
    assert.deepEqual(await mailed("pending", "reject"), ["ok", 0]);
  });
  it("refuses a move from the wrong state without mailing", async () => {
    assert.deepEqual(await mailed("approved", "submit"), ["invalid_state", 0]);
  });
  it("refuses to submit with too few entries", async () => {
    const f = fake("draft", 1);
    assert.equal(
      await gameLifecycle(f.pool, f.mail).move(game, "submit"),
      "too_few_entries",
    );
    assert.deepEqual(f.sent, []);
  });
});
