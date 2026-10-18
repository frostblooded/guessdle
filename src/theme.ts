// Theme: the player's light/dark preference, remembered across days.

export type ThemeMode = "auto" | "light" | "dark";

export const THEME_STORAGE_KEY: string = "theme";

const CYCLE: readonly ThemeMode[] = ["auto", "light", "dark"];

// The part of the browser Storage that Theme uses
export interface ThemeStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

// Missing, unknown or unreadable (blocked storage) reads as auto
export function readThemeMode(storage: ThemeStorage): ThemeMode {
  try {
    const raw: string | null = storage.getItem(THEME_STORAGE_KEY);
    return CYCLE.find((mode: ThemeMode): boolean => mode === raw) ?? "auto";
  } catch {
    return "auto";
  }
}

// Blocked storage keeps the choice for this page view only
export function writeThemeMode(storage: ThemeStorage, mode: ThemeMode): void {
  try {
    storage.setItem(THEME_STORAGE_KEY, mode);
  } catch {
    // ignored on purpose
  }
}

export function nextThemeMode(mode: ThemeMode): ThemeMode {
  return CYCLE[(CYCLE.indexOf(mode) + 1) % CYCLE.length]!;
}

// The part of the page Theme drives: <html>
export interface ThemeRoot {
  dataset: Record<string, string | undefined>;
}

// Auto removes data-theme (the OS decides); light and dark force it
export function applyThemeMode(root: ThemeRoot, mode: ThemeMode): void {
  if (mode === "auto") {
    delete root.dataset["theme"];
  } else {
    root.dataset["theme"] = mode;
  }
}

export const themeLabel = (mode: ThemeMode): string => `Theme: ${mode}`;
