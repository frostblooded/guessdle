import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  nextThemeMode,
  readThemeMode,
  THEME_STORAGE_KEY,
  writeThemeMode,
  type ThemeStorage,
} from "../theme.ts";

function memoryStorage(
  initial?: string,
): ThemeStorage & { raw(): string | null } {
  let value: string | null = initial ?? null;
  return {
    getItem: (): string | null => value,
    setItem: (_key: string, v: string): void => {
      value = v;
    },
    raw: (): string | null => value,
  };
}

describe("theme mode", () => {
  it("cycles auto, light, dark, auto", () => {
    assert.equal(nextThemeMode("auto"), "light");
    assert.equal(nextThemeMode("light"), "dark");
    assert.equal(nextThemeMode("dark"), "auto");
  });

  it("reads missing storage as auto", () => {
    assert.equal(readThemeMode(memoryStorage()), "auto");
  });

  for (const mode of ["auto", "light", "dark"] as const) {
    it(`round-trips ${mode}`, () => {
      const storage = memoryStorage();
      writeThemeMode(storage, mode);
      assert.equal(readThemeMode(storage), mode);
    });
  }

  for (const junk of ["", "Dark", "blue", "null", "{}"]) {
    it(`reads unknown value ${JSON.stringify(junk)} as auto`, () => {
      assert.equal(readThemeMode(memoryStorage(junk)), "auto");
    });
  }

  it("uses the theme storage key", () => {
    const keys: string[] = [];
    writeThemeMode(
      { getItem: () => null, setItem: (k: string) => void keys.push(k) },
      "dark",
    );
    assert.deepEqual(keys, [THEME_STORAGE_KEY]);
  });
});
