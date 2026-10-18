import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "vitest";
import * as limits from "../src/game/limits.ts";
import { RESERVED_SLUGS, slugError, slugify } from "../src/game/slug.ts";

const text = (path: string): string =>
  readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

// The limits constant a component passes as maxLength to the field with this id
const maxlengthOf = (file: string, id: string): number => {
  const tag = new RegExp(`<(?:Input|Textarea)[^>]*id="${id}"[^>]*>`).exec(
    text(file),
  )?.[0];
  assert.ok(tag, `${file} has #${id}`);
  const name = /maxLength=\{(\w+)\}/.exec(tag)?.[1];
  return limits[name as keyof typeof limits];
};

describe("limits shared with the pages", () => {
  it("matches the maxlength of every limited field", () => {
    assert.equal(
      maxlengthOf("src/routes/create-page.tsx", "game-name"),
      limits.MAX_NAME,
    );
    assert.equal(
      maxlengthOf("src/routes/create-page.tsx", "game-slug"),
      limits.MAX_SLUG,
    );
    assert.equal(
      maxlengthOf("src/routes/edit/edit-page.tsx", "edit-name"),
      limits.MAX_NAME,
    );
    assert.equal(
      maxlengthOf("src/routes/edit/edit-page.tsx", "edit-description"),
      limits.MAX_DESCRIPTION,
    );
    assert.equal(
      maxlengthOf("src/routes/edit/attributes-panel.tsx", "attr-name"),
      limits.MAX_ATTRIBUTE_NAME,
    );
    assert.equal(
      maxlengthOf("src/routes/edit/entries-panel.tsx", "entry-name"),
      limits.MAX_ENTRY_NAME,
    );
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
  it("says the entry minimum in the editor copy from the shared limit", () => {
    assert.match(
      text("src/routes/edit/entries-panel.tsx"),
      /at least(\{" "\})?\s+\{MIN_ENTRIES\}(\{" "\})?\s+entries/,
    );
  });
});

describe("RESERVED_SLUGS", () => {
  const names = new Set<string>(["api", "g"]);
  // Static folders and app routes the dev server and nginx expose at the top level
  const dev = text("scripts/server.mjs");
  for (const group of dev.matchAll(/\(([a-z|]+)\)\/\.\+/g)) {
    group[1]!.split("|").forEach((folder) => names.add(folder));
  }
  const routes = /const ROUTES =\s*\/\^\\\/\(([^)]*)\)/.exec(dev)?.[1];
  assert.ok(routes, "scripts/server.mjs lists ROUTES");
  for (const route of routes.split("|")) {
    if (/^[a-z-]+$/.test(route)) {
      names.add(route);
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
