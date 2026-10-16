import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { GUESS_DATA } from "../src/game/roster.ts";

describe("roster ids", () => {
  it("gives every pet a unique id", () => {
    const ids: string[] = GUESS_DATA.map((pet) => pet.id);
    assert.equal(new Set(ids).size, ids.length);
  });

  it("uses lowercase slugs", () => {
    for (const pet of GUESS_DATA) {
      assert.match(pet.id, /^[a-z0-9]+(-[a-z0-9]+)*$/, pet.name);
    }
  });

  it("keeps names unique too, since the autocomplete matches on them", () => {
    const names: string[] = GUESS_DATA.map((pet) => pet.name.toLowerCase());
    assert.equal(new Set(names).size, names.length);
  });
});
