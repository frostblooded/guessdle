import assert from "node:assert/strict";
import { describe, it } from "vitest";
import {
  GUESS_MODE_STORAGE_KEY,
  filterByName,
  readGuessMode,
  writeGuessMode,
  type GuessModeStorage,
} from "../src/game/guess-mode.ts";

function memoryStorage(initial?: string): GuessModeStorage & {
  raw(): string | null;
} {
  let value: string | null = initial ?? null;
  return {
    getItem: (): string | null => value,
    setItem: (key: string, v: string): void => {
      assert.equal(key, GUESS_MODE_STORAGE_KEY);
      value = v;
    },
    raw: (): string | null => value,
  };
}

const blocked: GuessModeStorage = {
  getItem: () => {
    throw new Error("blocked");
  },
  setItem: () => {
    throw new Error("blocked");
  },
};

describe("guess mode storage", () => {
  it("defaults to typing when nothing, junk or blocked storage is found", () => {
    assert.equal(readGuessMode(memoryStorage()), "type");
    assert.equal(readGuessMode(memoryStorage("list")), "type");
    assert.equal(readGuessMode(blocked), "type");
  });

  it("remembers selection mode", () => {
    const storage = memoryStorage();
    writeGuessMode(storage, "select");
    assert.equal(storage.raw(), "select");
    assert.equal(readGuessMode(storage), "select");
  });

  it("ignores blocked storage when saving", () => {
    assert.doesNotThrow(() => writeGuessMode(blocked, "select"));
  });
});

const ENTRIES = [{ name: "bela" }, { name: "Dido" }, { name: "Abby" }];
const names = (list: readonly { name: string }[]): string[] =>
  list.map((e) => e.name);

describe("filterByName", () => {
  it("sorts by name, any letter case", () => {
    assert.deepEqual(names(filterByName(ENTRIES, "")), [
      "Abby",
      "bela",
      "Dido",
    ]);
  });

  it("keeps names containing the filter text, any letter case", () => {
    assert.deepEqual(names(filterByName(ENTRIES, " B ")), ["Abby", "bela"]);
  });

  it("leaves the input untouched", () => {
    filterByName(ENTRIES, "");
    assert.deepEqual(names(ENTRIES), ["bela", "Dido", "Abby"]);
  });
});
