import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { statusNotice, type Details } from "../src/game/editor.ts";

const base: Details = {
  slug: "pets",
  name: "Pets",
  description: "",
  cover: "",
  status: "draft",
  rejectReason: "",
  skipPeriod: null,
  entryCount: 5,
};

describe("statusNotice", () => {
  it("says nothing for an approved game", () => {
    assert.equal(statusNotice({ ...base, status: "approved" }), "");
    assert.equal(
      statusNotice({ ...base, status: "approved", entryCount: 0 }),
      "",
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
