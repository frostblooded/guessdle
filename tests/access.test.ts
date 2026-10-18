import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { canApprove, decide, type Need } from "../src/server/access.ts";
import type { GameRow, Roster } from "../src/server/games.ts";
import type { SessionUser } from "../src/server/auth.ts";

const found = (status: string, entries: number, ownerBanned = false) => ({
  game: { status, ownerId: 7, ownerBanned } as GameRow,
  roster: { entries: new Array(entries).fill({}) } as unknown as Roster,
});
const user = (id: number, admin = false, banned = false) =>
  ({ id, admin, banned }) as SessionUser;
const VIEWERS = {
  anon: null,
  stranger: user(8),
  owner: user(7),
  admin: user(9, true),
};

type Row = [string, number, keyof typeof VIEWERS, Need, string | null];
const rows: Row[] = [
  // A playable game is open to everyone to play and read
  ["approved", 2, "anon", "play", null],
  ["pending", 2, "stranger", "play", null],
  // Hidden games are 404 to everyone but the owner and admins, whatever is asked
  ["draft", 2, "anon", "play", "not_found"],
  ["draft", 2, "anon", "edit", "not_found"],
  ["draft", 2, "stranger", "edit", "not_found"],
  ["approved", 1, "stranger", "play", "not_found"],
  ["draft", 0, "owner", "play", null],
  ["approved", 1, "admin", "play", null],
  // A visible game: 401 to anonymous, 403 to a stranger, the owner and admin edit
  ["approved", 2, "anon", "edit", "unauthorized"],
  ["approved", 2, "stranger", "edit", "forbidden"],
  ["approved", 2, "owner", "edit", null],
  ["draft", 0, "admin", "edit", null],
  // Admin: the role is checked before the game, so a stranger learns nothing
  ["draft", 0, "anon", "admin", "unauthorized"],
  ["approved", 2, "owner", "admin", "forbidden"],
  ["draft", 0, "admin", "admin", null],
];

describe("decide", () => {
  for (const [status, count, who, need, want] of rows) {
    it(`${status} with ${count} entries, ${who}, ${need}: ${want ?? "allowed"}`, () => {
      assert.equal(decide(found(status, count), VIEWERS[who], need), want);
    });
  }
  it("is not_found for a missing game, but admin is checked first", () => {
    assert.equal(decide(undefined, VIEWERS.owner, "edit"), "not_found");
    assert.equal(decide(undefined, VIEWERS.owner, "admin"), "forbidden");
    assert.equal(decide(undefined, VIEWERS.admin, "admin"), "not_found");
  });
});

describe("decide with a banned owner", () => {
  const banned = found("approved", 2, true);
  const owner = user(7, false, true);
  it("hides the game from everyone but its owner and admins", () => {
    assert.equal(decide(banned, null, "play"), "not_found");
    assert.equal(decide(banned, VIEWERS.stranger, "play"), "not_found");
    assert.equal(decide(banned, VIEWERS.stranger, "edit"), "not_found");
    assert.equal(decide(banned, owner, "play"), null);
    assert.equal(decide(banned, VIEWERS.admin, "play"), null);
    assert.equal(decide(banned, VIEWERS.admin, "edit"), null);
  });
  it("lets the banned owner play but not edit", () => {
    assert.equal(decide(banned, owner, "edit"), "banned");
    assert.equal(decide(found("draft", 0), owner, "edit"), "banned");
    assert.equal(decide(found("draft", 0), owner, "play"), null);
  });
});

describe("canApprove", () => {
  it("is only for an admin, only on a pending game", () => {
    const pending = found("pending", 2).game;
    assert.equal(canApprove(pending, VIEWERS.admin), true);
    for (const who of ["anon", "stranger", "owner"] as const) {
      assert.equal(canApprove(pending, VIEWERS[who]), false, who);
    }
    for (const status of ["draft", "approved", "rejected"]) {
      assert.equal(
        canApprove(found(status, 2).game, VIEWERS.admin),
        false,
        status,
      );
    }
  });
});
