import assert from "node:assert/strict";
import { describe, it } from "vitest";
import {
  blurProgress,
  cellRect,
  isBlurOrder,
  isGameKind,
  isTryCount,
  minEntriesOf,
  outOfTries,
  toggleCell,
} from "../src/game/blur.ts";

describe("isGameKind", () => {
  it("knows classic and blur", () => {
    assert.ok(isGameKind("classic"));
    assert.ok(isGameKind("blur"));
    assert.ok(!isGameKind("zoom"));
    assert.ok(!isGameKind(undefined));
  });
});

describe("minEntriesOf", () => {
  it("lets a Blur game play with a single entry", () => {
    assert.equal(minEntriesOf("blur"), 1);
    assert.equal(minEntriesOf("classic"), 2);
  });
});

describe("outOfTries", () => {
  it("loses once the guesses reach the tries without the answer", () => {
    assert.ok(outOfTries(3, 3, false));
    assert.ok(outOfTries(3, 4, false));
    assert.ok(!outOfTries(3, 2, false));
    assert.ok(!outOfTries(3, 3, true));
  });
  it("a classic game has no tries to run out of", () => {
    assert.ok(!outOfTries(null, 50, false));
    assert.ok(!outOfTries(undefined, 50, false));
  });
});

describe("isTryCount", () => {
  it("takes whole numbers from 1 to 9", () => {
    assert.ok(isTryCount(1));
    assert.ok(isTryCount(9));
    for (const bad of [0, 10, 2.5, "3", null]) {
      assert.ok(!isTryCount(bad));
    }
  });
});

describe("isBlurOrder", () => {
  it("takes every cell 0-8 exactly once", () => {
    assert.ok(isBlurOrder([4, 0, 1, 2, 3, 5, 6, 7, 8]));
  });
  it("refuses anything else", () => {
    for (const bad of [
      null,
      [],
      [0, 1, 2, 3, 4, 5, 6, 7],
      [0, 0, 1, 2, 3, 4, 5, 6, 7],
      [0, 1, 2, 3, 4, 5, 6, 7, 9],
      [0, 1, 2, 3, 4, 5, 6, 7, 8.5],
      ["0", 1, 2, 3, 4, 5, 6, 7, 8],
    ]) {
      assert.ok(!isBlurOrder(bad));
    }
  });
});

describe("toggleCell", () => {
  it("adds an unpicked cell last and takes a picked one out", () => {
    assert.deepEqual(toggleCell([], 4), [4]);
    assert.deepEqual(toggleCell([4, 0], 2), [4, 0, 2]);
    assert.deepEqual(toggleCell([4, 0, 2], 0), [4, 2]);
  });
  it("puts the last cell in by itself after eight picks", () => {
    assert.deepEqual(
      toggleCell([0, 1, 2, 3, 4, 5, 6], 8),
      [0, 1, 2, 3, 4, 5, 6, 8, 7],
    );
    // Taking one out of a full order leaves eight, without filling it back
    assert.deepEqual(
      toggleCell([0, 1, 2, 3, 4, 5, 6, 8, 7], 7),
      [0, 1, 2, 3, 4, 5, 6, 8],
    );
  });
});

describe("cellRect", () => {
  it("splits the image into a 3x3 grid row by row", () => {
    assert.deepEqual(cellRect(0, 300, 300), {
      left: 0,
      top: 0,
      width: 100,
      height: 100,
    });
    assert.deepEqual(cellRect(5, 300, 300), {
      left: 200,
      top: 100,
      width: 100,
      height: 100,
    });
  });
  it("covers every pixel when the side does not divide by three", () => {
    const rects = Array.from({ length: 9 }, (_, i) => cellRect(i, 800, 800));
    assert.equal(
      rects.slice(0, 3).reduce((sum, r) => sum + r.width, 0),
      800,
    );
    assert.equal(rects[8]!.left + rects[8]!.width, 800);
    assert.equal(rects[8]!.top + rects[8]!.height, 800);
  });
});

describe("blurProgress", () => {
  it("clears one more square per wrong guess, then all tries' worth once over", () => {
    assert.deepEqual(blurProgress(0, 3, false), {
      shown: 1,
      left: 3,
      lost: false,
    });
    assert.deepEqual(blurProgress(2, 3, false), {
      shown: 3,
      left: 1,
      lost: false,
    });
    assert.deepEqual(blurProgress(3, 3, false), {
      shown: 3,
      left: 0,
      lost: true,
    });
    assert.deepEqual(blurProgress(1, 9, true), {
      shown: 9,
      left: 8,
      lost: false,
    });
  });
});
