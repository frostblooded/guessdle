import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { parseEntryInput, parseGamePatch } from "../src/server/validate.ts";

describe("parseGamePatch", () => {
  it("accepts an empty body as an empty patch", () => {
    assert.deepEqual(parseGamePatch({}, 3), {});
  });
  it("trims the name and rejects empty, blank, long or non-string names", () => {
    assert.deepEqual(parseGamePatch({ name: "  Pets " }, 3), { name: "Pets" });
    assert.deepEqual(parseGamePatch({ name: "a".repeat(60) }, 3), {
      name: "a".repeat(60),
    });
    for (const name of ["", "   ", "a".repeat(61), 5, null]) {
      assert.equal(parseGamePatch({ name }, 3), undefined);
    }
  });
  it("keeps the description as typed up to 500 chars", () => {
    assert.deepEqual(parseGamePatch({ description: "" }, 3), {
      description: "",
    });
    assert.deepEqual(parseGamePatch({ description: "a".repeat(500) }, 3), {
      description: "a".repeat(500),
    });
    assert.equal(
      parseGamePatch({ description: "a".repeat(501) }, 3),
      undefined,
    );
    assert.equal(parseGamePatch({ description: 1 }, 3), undefined);
  });
  it("accepts a skip period from 0 to the roster maximum, or null", () => {
    assert.deepEqual(parseGamePatch({ skipPeriod: 0 }, 3), { skipPeriod: 0 });
    assert.deepEqual(parseGamePatch({ skipPeriod: 3 }, 3), { skipPeriod: 3 });
    assert.deepEqual(parseGamePatch({ skipPeriod: null }, 3), {
      skipPeriod: null,
    });
    for (const skipPeriod of [4, -1, 1.5, "2", NaN]) {
      assert.equal(parseGamePatch({ skipPeriod }, 3), undefined);
    }
  });
  it("shape-checks the cover only", () => {
    assert.deepEqual(parseGamePatch({ coverUrl: "" }, 3), { coverUrl: "" });
    assert.deepEqual(parseGamePatch({ coverUrl: "/uploads/a.png" }, 3), {
      coverUrl: "/uploads/a.png",
    });
    assert.equal(parseGamePatch({ coverUrl: 3 }, 3), undefined);
    assert.equal(parseGamePatch({ coverUrl: null }, 3), undefined);
  });
});

describe("parseGamePatch: Zoom games", () => {
  it("takes a part count of 1 to 6 for a Zoom game only", () => {
    assert.deepEqual(parseGamePatch({ zoomParts: 4 }, 3, true), {
      zoomParts: 4,
    });
    assert.equal(parseGamePatch({ zoomParts: 4 }, 3), undefined);
    for (const zoomParts of [0, 7, 2.5, "3"]) {
      assert.equal(parseGamePatch({ zoomParts }, 3, true), undefined);
    }
  });
});

describe("parseEntryInput", () => {
  it("accepts an empty body", () => {
    assert.deepEqual(parseEntryInput({}), {});
  });
  it("shape-checks zoomed parts", () => {
    assert.deepEqual(parseEntryInput({ parts: [{ x: 1, y: 2, size: 20 }] }), {
      parts: [{ x: 1, y: 2, size: 20 }],
    });
    assert.equal(parseEntryInput({ parts: [{ x: 1 }] }), undefined);
  });
  it("trims the name and bounds it to 60", () => {
    assert.deepEqual(parseEntryInput({ name: " Rex " }), { name: "Rex" });
    assert.equal(parseEntryInput({ name: "a".repeat(61) }), undefined);
    assert.equal(parseEntryInput({ name: " " }), undefined);
    assert.equal(parseEntryInput({ name: 1 }), undefined);
  });
  it("shape-checks the photo only", () => {
    assert.deepEqual(parseEntryInput({ photo: "" }), { photo: "" });
    assert.equal(parseEntryInput({ photo: 1 }), undefined);
  });
  it("trims values, wraps a lone string, drops blanks", () => {
    assert.deepEqual(
      parseEntryInput({ values: { 1: [" a ", "", "b"], 2: " solo ", 3: "" } }),
      { values: { 1: ["a", "b"], 2: ["solo"], 3: [] } },
    );
  });
  it("rejects too many items, long items and non-string items", () => {
    assert.equal(
      parseEntryInput({ values: { 1: Array(21).fill("a") } }),
      undefined,
    );
    assert.equal(
      parseEntryInput({ values: { 1: ["a".repeat(201)] } }),
      undefined,
    );
    assert.equal(parseEntryInput({ values: { 1: [1] } }), undefined);
    assert.equal(parseEntryInput({ values: { 1: null } }), undefined);
    assert.equal(parseEntryInput({ values: "x" }), undefined);
    assert.equal(parseEntryInput({ values: null }), undefined);
  });
});
