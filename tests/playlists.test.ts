import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { MAX_USERNAME, MIN_USERNAME } from "../src/game/limits.ts";
import {
  isUsername,
  normalizeUsername,
  playlistPath,
  profilePath,
} from "../src/game/playlists.ts";

describe("usernames", () => {
  it("takes lowercase letters, digits and underscores within the limits", () => {
    assert.ok(isUsername("ann_99"));
    assert.ok(isUsername("a".repeat(MIN_USERNAME)));
    assert.ok(isUsername("a".repeat(MAX_USERNAME)));
    for (const bad of [
      "a".repeat(MIN_USERNAME - 1),
      "a".repeat(MAX_USERNAME + 1),
      "Ann",
      "an n",
      "ann-b",
      "ané",
      42,
      null,
    ]) {
      assert.equal(isUsername(bad), false, String(bad));
    }
  });

  it("trims and lowercases what a player types", () => {
    assert.equal(normalizeUsername("  Ann_B "), "ann_b");
  });

  it("builds the profile and playlist paths", () => {
    assert.equal(profilePath("ann"), "/u/ann");
    assert.equal(playlistPath(12), "/p/12");
  });
});
