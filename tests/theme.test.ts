import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  initTheme,
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

describe("initTheme", () => {
  function setup(
    initial?: string,
    storage: ThemeStorage & { raw(): string | null } = memoryStorage(initial),
  ) {
    const root = { dataset: {} as Record<string, string | undefined> };
    const attrs: Record<string, string> = {};
    let click: () => void = () => {};
    const button = {
      textContent: null as string | null,
      setAttribute: (name: string, value: string): void => {
        attrs[name] = value;
      },
      addEventListener: (_type: "click", listener: () => void): void => {
        click = listener;
      },
    };
    initTheme(root, button, storage);
    return { root, button, attrs, storage, click: () => click() };
  }

  it("shows auto with no data-theme when nothing is stored", () => {
    const { root, button, attrs } = setup();
    assert.equal("theme" in root.dataset, false);
    assert.equal(button.textContent, "Theme: auto");
    assert.equal(attrs["aria-label"], "Theme: auto. Click to change.");
  });

  it("applies a stored mode on load", () => {
    const { root, button } = setup("dark");
    assert.equal(root.dataset["theme"], "dark");
    assert.equal(button.textContent, "Theme: dark");
  });

  it("cycles on click, updating page and storage", () => {
    const t = setup();
    t.click();
    assert.equal(t.root.dataset["theme"], "light");
    assert.equal(t.storage.raw(), "light");
    t.click();
    assert.equal(t.root.dataset["theme"], "dark");
    assert.equal(t.button.textContent, "Theme: dark");
    t.click();
    assert.equal("theme" in t.root.dataset, false);
    assert.equal(t.storage.raw(), "auto");
    assert.equal(t.attrs["aria-label"], "Theme: auto. Click to change.");
  });

  it("still cycles for this page view when storage is blocked", () => {
    const blocked: ThemeStorage & { raw(): string | null } = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
      raw: () => null,
    };
    const t = setup(undefined, blocked);
    t.click();
    assert.equal(t.root.dataset["theme"], "light");
  });
});
