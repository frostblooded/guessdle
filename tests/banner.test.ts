import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { bannerOf, MAX_TILES } from "../src/game/banner.ts";

const photos = (n: number): string[] =>
  Array.from({ length: n }, (_, i) => `/uploads/${i}.webp`);

describe("bannerOf", () => {
  it("keeps the game's own cover, whatever the photos", () => {
    assert.deepEqual(bannerOf("/uploads/c.webp", photos(3)), {
      kind: "cover",
      url: "/uploads/c.webp",
    });
  });
  it("is no banner without a cover or any photo", () => {
    assert.equal(bannerOf("", []), null);
    assert.equal(bannerOf("", ["", ""]), null);
  });
  it("skips entries without a photo", () => {
    assert.deepEqual(bannerOf("", ["", "/a.webp", "", "/b.webp"]), {
      kind: "collage",
      tiles: ["/a.webp", "/b.webp"],
      columns: 2,
    });
  });
  it("lays up to four photos out in one row", () => {
    for (const n of [1, 2, 3, 4]) {
      assert.deepEqual(bannerOf("", photos(n)), {
        kind: "collage",
        tiles: photos(n),
        columns: n,
      });
    }
  });
  it("fills two full rows from more, dropping an odd one out", () => {
    assert.deepEqual(bannerOf("", photos(5)), {
      kind: "collage",
      tiles: photos(4),
      columns: 2,
    });
    assert.deepEqual(bannerOf("", photos(7)), {
      kind: "collage",
      tiles: photos(6),
      columns: 3,
    });
  });
  it(`stops at ${MAX_TILES} tiles in roster order`, () => {
    assert.deepEqual(bannerOf("", photos(20)), {
      kind: "collage",
      tiles: photos(MAX_TILES),
      columns: MAX_TILES / 2,
    });
  });
});
