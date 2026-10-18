import assert from "node:assert/strict";
import { describe, it } from "vitest";
import {
  canApprove,
  decide,
  playBlocker,
  type Need,
} from "../src/server/access.ts";
import type { GameRow, Roster } from "../src/server/games.ts";
import type { SessionUser } from "../src/server/auth.ts";

const found = (status: string, entries: number) => ({
  game: { status, ownerId: 7 } as GameRow,
  roster: { entries: new Array(entries).fill({}) } as unknown as Roster,
});
const user = (id: number, admin = false) => ({ id, admin }) as SessionUser;
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

describe("playBlocker", () => {
  const of = (kind: string, entries: number, incomplete = 0) =>
    playBlocker(
      { kind, status: "approved" } as GameRow,
      { entries: new Array(entries).fill({}), incomplete } as unknown as Roster,
    );
  it("a classic game needs two active entries, a Blur game one", () => {
    assert.equal(of("classic", 1), "not_enough_entries");
    assert.equal(of("classic", 2), null);
    assert.equal(of("blur", 0), "not_enough_entries");
    assert.equal(of("blur", 1), null);
  });
  it("an entry missing a value pauses the game; too few entries is said first", () => {
    assert.equal(of("classic", 3, 1), "game_paused");
    assert.equal(of("blur", 1, 1), "game_paused");
    assert.equal(of("classic", 1, 1), "not_enough_entries");
  });
});
