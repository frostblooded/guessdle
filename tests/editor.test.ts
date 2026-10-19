import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { erasedBy, statusNotice, type Details } from "../src/game/editor.ts";

const base: Details = {
  slug: "pets",
  name: "Pets",
  description: "",
  cover: "",
  status: "draft",
  rejectReason: "",
  skipPeriod: null,
  kind: "classic",
  blurTries: 5,
  entryCount: 5,
  incompleteCount: 0,
};

describe("statusNotice", () => {
  it("asks every kind of game for one entry only", () => {
    for (const kind of ["classic", "blur", "sequence"] as const) {
      assert.match(
        statusNotice({ ...base, kind, entryCount: 0 }),
        /needs 1 more entry/,
      );
      assert.doesNotMatch(
        statusNotice({ ...base, kind, entryCount: 1 }),
        /more entr/,
      );
    }
  });

  it("says nothing for an approved game", () => {
    assert.equal(statusNotice({ ...base, status: "approved" }), "");
    assert.equal(
      statusNotice({ ...base, status: "approved", entryCount: 0 }),
      "",
    );
  });

  it("says a game with incomplete entries is paused, approved or not", () => {
    assert.match(
      statusNotice({ ...base, status: "approved", incompleteCount: 1 }),
      /^Paused: 1 entry is missing values/,
    );
    assert.match(
      statusNotice({ ...base, incompleteCount: 3 }),
      /^Draft.* Paused: 3 entries are missing values/,
    );
  });

  it("explains every other status", () => {
    assert.match(statusNotice(base), /^Draft/);
    assert.match(statusNotice({ ...base, status: "pending" }), /^Pending/);
    assert.match(
      statusNotice({ ...base, status: "rejected", rejectReason: "Too vague" }),
      /^Rejected: Too vague/,
    );
  });
});

describe("erasedBy", () => {
  const saved = [
    { id: 1, name: "Colors", type: "list" },
    { id: 2, name: "Height", type: "text" },
    { id: 3, name: "Owner", type: "text" },
  ];

  it("names removed attributes and changed types, not renames or new ones", () => {
    assert.deepEqual(
      erasedBy(saved, [
        { id: 1, type: "list" },
        { id: 2, type: "number" },
        { type: "number" },
      ]),
      ["Height", "Owner"],
    );
  });

  it("is empty when nothing is lost", () => {
    assert.deepEqual(erasedBy(saved, saved), []);
  });
});
