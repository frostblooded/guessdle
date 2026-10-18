import assert from "node:assert/strict";
import { describe, it } from "vitest";
import {
  clampPart,
  defaultParts,
  fillParts,
  isGameKind,
  isPartCount,
  parsePartList,
  partsFit,
  zoomProgress,
} from "../src/game/zoom.ts";

const IMAGE = { width: 400, height: 300 };

describe("parsePartList", () => {
  it("takes up to six whole-number squares", () => {
    assert.deepEqual(parsePartList([{ x: 1, y: 2, size: 30 }]), [
      { x: 1, y: 2, size: 30 },
    ]);
    assert.deepEqual(parsePartList([]), []);
  });
  it("refuses anything else", () => {
    for (const bad of [
      null,
      "x",
      [{ x: 1, y: 2 }],
      [{ x: 1.5, y: 2, size: 30 }],
      [{ x: "1", y: 2, size: 30 }],
      Array.from({ length: 7 }, () => ({ x: 0, y: 0, size: 20 })),
    ]) {
      assert.equal(parsePartList(bad), undefined);
    }
  });
});

describe("partsFit", () => {
  it("keeps every part inside the image and at least 16 px", () => {
    assert.ok(partsFit([{ x: 0, y: 0, size: 300 }], IMAGE));
    assert.ok(partsFit([{ x: 100, y: 0, size: 300 }], IMAGE));
    assert.ok(!partsFit([{ x: 101, y: 0, size: 300 }], IMAGE));
    assert.ok(!partsFit([{ x: -1, y: 0, size: 20 }], IMAGE));
    assert.ok(!partsFit([{ x: 0, y: 0, size: 15 }], IMAGE));
  });
});

describe("defaultParts", () => {
  it("grows from a close zoom to the largest centred square", () => {
    const parts = defaultParts(3, IMAGE);
    assert.equal(parts.length, 3);
    assert.ok(partsFit(parts, IMAGE));
    assert.deepEqual(parts[2], { x: 50, y: 0, size: 300 });
    assert.ok(parts[0]!.size < parts[1]!.size);
    assert.deepEqual(defaultParts(1, IMAGE), [{ x: 50, y: 0, size: 300 }]);
  });
});

describe("fillParts", () => {
  it("keeps the first parts and adds defaults up to the count", () => {
    const kept = { x: 10, y: 10, size: 40 };
    const out = fillParts([kept], 3, IMAGE);
    assert.equal(out.length, 3);
    assert.deepEqual(out[0], kept);
    assert.deepEqual(out.slice(1), defaultParts(3, IMAGE).slice(1));
    assert.deepEqual(fillParts([kept, kept, kept], 2, IMAGE), [kept, kept]);
  });
});

describe("clampPart", () => {
  it("slides a part back inside and bounds its size", () => {
    assert.deepEqual(clampPart({ x: 390, y: -5, size: 40 }, IMAGE), {
      x: 360,
      y: 0,
      size: 40,
    });
    assert.deepEqual(clampPart({ x: 0, y: 0, size: 999 }, IMAGE), {
      x: 0,
      y: 0,
      size: 300,
    });
    assert.equal(clampPart({ x: 0, y: 0, size: 2 }, IMAGE).size, 16);
  });
});

describe("zoomProgress", () => {
  it("shows one more part per wrong guess, then all of them once over", () => {
    assert.deepEqual(zoomProgress(0, 3, false), {
      shown: 1,
      left: 3,
      lost: false,
    });
    assert.deepEqual(zoomProgress(2, 3, false), {
      shown: 3,
      left: 1,
      lost: false,
    });
    assert.deepEqual(zoomProgress(3, 3, false), {
      shown: 3,
      left: 0,
      lost: true,
    });
    assert.equal(zoomProgress(0, 3, true).shown, 3);
  });
});

describe("kinds and counts", () => {
  it("knows the two kinds and 1 to 6 parts", () => {
    assert.ok(isGameKind("classic") && isGameKind("zoom"));
    assert.ok(!isGameKind("quiz"));
    assert.ok(isPartCount(1) && isPartCount(6));
    assert.ok(!isPartCount(0) && !isPartCount(7) && !isPartCount(2.5));
  });
});
