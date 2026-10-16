import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { adminEmailsFromEnv } from "../src/server/auth.ts";

describe("adminEmailsFromEnv", () => {
  it("splits on commas, trims and lowercases", () => {
    assert.deepEqual(adminEmailsFromEnv(" A@x.test, b@X.test ,,"), [
      "a@x.test",
      "b@x.test",
    ]);
  });

  it("is empty when unset or blank", () => {
    assert.deepEqual(adminEmailsFromEnv(undefined), []);
    assert.deepEqual(adminEmailsFromEnv("  "), []);
  });
});
