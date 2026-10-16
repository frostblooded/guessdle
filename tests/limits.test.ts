import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";
import * as limits from "../src/game/limits.ts";
import { RESERVED_SLUGS, slugError, slugify } from "../src/game/slug.ts";

const text = (path: string): string =>
  readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

// The maxlength of the element with this id in a page
const maxlengthOf = (page: string, id: string): number => {
  const tag = new RegExp(`<(?:input|textarea)[^>]*id="${id}"[^>]*>`).exec(
    text(page),
  )?.[0];
  assert.ok(tag, `${page} has #${id}`);
  return Number(/maxlength="(\d+)"/.exec(tag)?.[1]);
};

describe("limits shared with the HTML", () => {
  it("matches the maxlength of every limited field", () => {
    assert.equal(maxlengthOf("create.html", "game-name"), limits.MAX_NAME);
    assert.equal(maxlengthOf("create.html", "game-slug"), limits.MAX_SLUG);
    assert.equal(maxlengthOf("edit.html", "edit-name"), limits.MAX_NAME);
    assert.equal(
      maxlengthOf("edit.html", "edit-description"),
      limits.MAX_DESCRIPTION,
    );
    assert.equal(
      maxlengthOf("edit.html", "attr-name"),
      limits.MAX_ATTRIBUTE_NAME,
    );
    assert.equal(maxlengthOf("edit.html", "entry-name"), limits.MAX_ENTRY_NAME);
  });
  it("derives the slug rules from the limits", () => {
    assert.equal(
      slugify("a".repeat(limits.MAX_SLUG + 10)).length,
      limits.MAX_SLUG,
    );
    assert.equal(slugError("a".repeat(limits.MIN_SLUG - 1)), "invalid");
    assert.equal(slugError("a".repeat(limits.MIN_SLUG)), null);
    assert.equal(slugError("a".repeat(limits.MAX_SLUG + 1)), "invalid");
  });
  it("says the entry minimum in the editor copy", () => {
    assert.match(
      text("edit.html"),
      new RegExp(`at least ${limits.MIN_ENTRIES} entries`),
    );
  });
});

describe("RESERVED_SLUGS", () => {
  const names = new Set<string>(["api", "g"]);
  for (const file of readdirSync(new URL("../", import.meta.url))) {
    if (file.endsWith(".html")) {
      names.add(file.slice(0, -".html".length));
    }
  }
  // Static folders and clean-URL pages the dev server and nginx expose at the top level
  const dev = text("scripts/server.mjs");
  for (const group of dev.matchAll(/\(([a-z|]+)\)\/\.\+/g)) {
    group[1]!.split("|").forEach((folder) => names.add(folder));
  }
  for (const set of dev.matchAll(/new Set\(\[([^\]]*)\]\)/g)) {
    for (const page of set[1]!.matchAll(/"([^"]+)"/g)) {
      names.add(page[1]!);
    }
  }
  for (const loc of text("deploy/nginx.conf").matchAll(
    /location \/([a-z-]+)\//g,
  )) {
    names.add(loc[1]!);
  }
  for (const name of [...names].sort()) {
    it(`reserves /${name}`, () => {
      assert.ok(RESERVED_SLUGS.includes(name), `${name} is not reserved`);
    });
  }
});
