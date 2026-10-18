import assert from "node:assert/strict";
import { describe, it } from "vitest";
import {
  applyThemeMode,
  nextThemeMode,
  readThemeMode,
  THEME_STORAGE_KEY,
  themeLabel,
  writeThemeMode,
  type ThemeStorage,
} from "../src/theme.ts";

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

  it("survives blocked storage", () => {
    const blocked: ThemeStorage = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    };
    assert.equal(readThemeMode(blocked), "auto");
    assert.doesNotThrow(() => writeThemeMode(blocked, "dark"));
  });
});

describe("applyThemeMode", () => {
  it("auto removes data-theme so the OS decides", () => {
    const root = {
      dataset: { theme: "dark" } as Record<string, string | undefined>,
    };
    applyThemeMode(root, "auto");
    assert.equal("theme" in root.dataset, false);
  });

  for (const mode of ["light", "dark"] as const) {
    it(`${mode} forces data-theme`, () => {
      const root = { dataset: {} as Record<string, string | undefined> };
      applyThemeMode(root, mode);
      assert.equal(root.dataset["theme"], mode);
    });
  }

  it("labels the button with the mode", () => {
    assert.equal(themeLabel("auto"), "Theme: auto");
  });
});
