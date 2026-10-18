import assert from "node:assert/strict";
import { describe, it } from "vitest";
import {
  GUESS_MODE_STORAGE_KEY,
  listEntries,
  nextSort,
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

const ENTRIES = [
  { name: "bela", values: ["Black", "12", ["Ann", "Bo"]] },
  { name: "Dido", values: ["White", "3", ["Cy"]] },
  { name: "Abby", values: ["White", "100", ["Ann"]] },
];
const TYPES = ["text", "number", "list"] as const;
const names = (list: readonly { name: string }[]): string[] =>
  list.map((e) => e.name);

describe("listEntries", () => {
  it("sorts by name by default, any letter case", () => {
    assert.deepEqual(
      names(listEntries(ENTRIES, TYPES, "", { column: -1, descending: false })),
      ["Abby", "bela", "Dido"],
    );
  });

  it("keeps names containing the filter text, any letter case", () => {
    assert.deepEqual(
      names(
        listEntries(ENTRIES, TYPES, " B ", { column: -1, descending: false }),
      ),
      ["Abby", "bela"],
    );
  });

  it("sorts a text column, ties by name, and flips when descending", () => {
    assert.deepEqual(
      names(listEntries(ENTRIES, TYPES, "", { column: 0, descending: false })),
      ["bela", "Abby", "Dido"],
    );
    assert.deepEqual(
      names(listEntries(ENTRIES, TYPES, "", { column: 0, descending: true })),
      ["Abby", "Dido", "bela"],
    );
  });

  it("sorts a Number column by value, not as text", () => {
    assert.deepEqual(
      names(listEntries(ENTRIES, TYPES, "", { column: 1, descending: false })),
      ["Dido", "bela", "Abby"],
    );
  });

  it("sorts a List column by its joined values", () => {
    assert.deepEqual(
      names(listEntries(ENTRIES, TYPES, "", { column: 2, descending: false })),
      ["Abby", "bela", "Dido"],
    );
  });

  it("leaves the input untouched", () => {
    listEntries(ENTRIES, TYPES, "", { column: 1, descending: true });
    assert.deepEqual(names(ENTRIES), ["bela", "Dido", "Abby"]);
  });
});

describe("nextSort", () => {
  it("flips the sorted column and starts a new one ascending", () => {
    assert.deepEqual(nextSort({ column: 1, descending: false }, 1), {
      column: 1,
      descending: true,
    });
    assert.deepEqual(nextSort({ column: 1, descending: true }, 0), {
      column: 0,
      descending: false,
    });
  });
});
