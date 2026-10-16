import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { rememberReturnTo, safeNext, takeReturnTo } from "../src/return-to.ts";

const memory = (): Storage => {
  const data = new Map<string, string>();
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
  } as Storage;
};

describe("return-to", () => {
  it("accepts same-site paths only", () => {
    assert.equal(safeNext("/create"), "/create");
    assert.equal(safeNext("/g/x/edit?a=1"), "/g/x/edit?a=1");
    for (const bad of [
      null,
      "",
      "create",
      "//evil.test",
      "/\\evil.test",
      "https://evil.test",
      "/a\nb",
    ]) {
      assert.equal(safeNext(bad), null, String(bad));
    }
  });

  it("is taken once, then falls back to the gallery", () => {
    const storage = memory();
    rememberReturnTo(storage, "/create");
    assert.equal(takeReturnTo(storage), "/create");
    assert.equal(takeReturnTo(storage), "/");
  });

  it("ignores an unsafe target", () => {
    const storage = memory();
    rememberReturnTo(storage, "//evil.test");
    assert.equal(takeReturnTo(storage), "/");
  });
});
