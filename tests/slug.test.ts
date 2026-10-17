import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { slugBase, slugError, slugify } from "../src/game/slug.ts";

describe("slugify", () => {
  it("lowercases and joins words with dashes", () => {
    assert.equal(slugify("My Cool Game!"), "my-cool-game");
  });
  it("strips accents and collapses symbols", () => {
    assert.equal(slugify("  Café -- Crème  "), "cafe-creme");
  });
  it("cuts at 40 characters without a trailing dash", () => {
    const slug = slugify("a".repeat(39) + " b");
    assert.equal(slug.length, 39);
    assert.ok(!slug.endsWith("-"));
  });
});

describe("slugBase", () => {
  it("pads names too short to be a slug", () => {
    assert.equal(slugBase("Ab"), "ab-game");
    assert.equal(slugBase("!!!"), "game");
  });
});

describe("slugError", () => {
  it("accepts 3 to 40 of a-z0-9-", () => {
    assert.equal(slugError("abc"), null);
    assert.equal(slugError("a".repeat(40)), null);
  });
  it("rejects bad shapes as invalid", () => {
    for (const s of ["ab", "a".repeat(41), "Abc", "a b", "a_b", "é-é-é"]) {
      assert.equal(slugError(s), "invalid", s);
    }
  });
  it("rejects site routes as reserved", () => {
    for (const s of ["api", "admin", "login", "my-games", "how-to-play"]) {
      assert.equal(slugError(s), "reserved", s);
    }
  });
});
