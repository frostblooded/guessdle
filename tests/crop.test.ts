import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CropError,
  CROP_FAILURES,
  clampRect,
  cropOutputSize,
  encodeUnderLimit,
  isImageKind,
  MAX_UPLOAD_BYTES,
  sameRect,
  UPLOAD_SHAPES,
} from "../src/game/crop.ts";

describe("UPLOAD_SHAPES", () => {
  it("crops photos square and covers to the gallery banner's 16:7", () => {
    assert.equal(UPLOAD_SHAPES.photo.aspect, 1);
    assert.equal(UPLOAD_SHAPES.cover.aspect, 16 / 7);
  });
  it("knows only photos and covers", () => {
    assert.ok(isImageKind("photo") && isImageKind("cover"));
    assert.ok(!isImageKind("avatar") && !isImageKind(undefined));
  });
});

describe("cropOutputSize", () => {
  it("shrinks a big crop so its longer side is the cap", () => {
    assert.deepEqual(cropOutputSize(2000, 1, 800), { width: 800, height: 800 });
    assert.deepEqual(cropOutputSize(3200, 16 / 7, 1200), {
      width: 1200,
      height: 525,
    });
  });
  it("keeps the exact aspect when the on-screen frame rounds oddly", () => {
    assert.deepEqual(cropOutputSize(800.4, 16 / 7, 1200), {
      width: 800,
      height: 350,
    });
  });
  it("never enlarges a small crop, only rounds it to whole pixels", () => {
    assert.deepEqual(cropOutputSize(300.4, 1, 800), {
      width: 300,
      height: 300,
    });
  });
  it("keeps at least one pixel per side, even from a 1x1 image", () => {
    assert.deepEqual(cropOutputSize(1, 16 / 7, 1200), { width: 1, height: 1 });
  });
});

describe("clampRect", () => {
  const bounds = { width: 600, height: 300 };
  it("leaves a frame that is already inside alone", () => {
    const rect = { x: 10, y: 20, width: 100, height: 100 };
    assert.ok(sameRect(clampRect(rect, bounds, 1), rect));
  });
  it("stops a frame dragged past an edge at that edge", () => {
    assert.deepEqual(
      clampRect({ x: -250, y: 50, width: 200, height: 200 }, bounds, 1),
      { x: 0, y: 50, width: 200, height: 200 },
    );
    assert.deepEqual(
      clampRect({ x: 500, y: 250, width: 200, height: 200 }, bounds, 1),
      { x: 400, y: 100, width: 200, height: 200 },
    );
  });
  it("shrinks a frame zoomed out past the image to the biggest that fits", () => {
    assert.deepEqual(
      clampRect({ x: 100, y: -50, width: 400, height: 400 }, bounds, 1),
      { x: 150, y: 0, width: 300, height: 300 },
    );
    assert.deepEqual(
      clampRect({ x: -100, y: -100, width: 1600, height: 700 }, bounds, 16 / 7),
      { x: 0, y: 37.5, width: 600, height: 262.5 },
    );
  });
});

const blob = (size: number) => ({ size });

describe("encodeUnderLimit", () => {
  it("keeps the first encoding that fits, without trying the rest", async () => {
    const tried: number[] = [];
    const out = await encodeUnderLimit(
      [10, 4, 2].map((size) => async () => {
        tried.push(size);
        return blob(size);
      }),
      5,
    );
    assert.deepEqual(out, blob(4));
    assert.deepEqual(tried, [10, 4]);
  });
  it("skips encodings the browser could not do", async () => {
    const out = await encodeUnderLimit(
      [async () => null, async () => blob(1)],
      5,
    );
    assert.deepEqual(out, blob(1));
  });
  it("is null when nothing fits the upload limit", async () => {
    const out = await encodeUnderLimit([
      async () => blob(MAX_UPLOAD_BYTES + 1),
    ]);
    assert.equal(out, null);
  });
  it("accepts a file exactly at the limit", async () => {
    const out = await encodeUnderLimit([async () => blob(MAX_UPLOAD_BYTES)]);
    assert.deepEqual(out, blob(MAX_UPLOAD_BYTES));
  });
});

describe("CropError", () => {
  it("carries its code and the text the page shows", () => {
    const e = new CropError("undecodable");
    assert.equal(e.code, "undecodable");
    assert.equal(e.message, CROP_FAILURES.undecodable);
  });
});
