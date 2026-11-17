export type ThemeMode = "auto" | "light" | "dark";

export const THEME_STORAGE_KEY: string = "theme";

const CYCLE: readonly ThemeMode[] = ["auto", "light", "dark"];

export interface ThemeStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function readThemeMode(storage: ThemeStorage): ThemeMode {
  try {
    const raw: string | null = storage.getItem(THEME_STORAGE_KEY);
    return CYCLE.find((mode: ThemeMode): boolean => mode === raw) ?? "auto";
  } catch {
    return "auto";
  }
}

export function writeThemeMode(storage: ThemeStorage, mode: ThemeMode): void {
  try {
    storage.setItem(THEME_STORAGE_KEY, mode);
  } catch {}
}

export function nextThemeMode(mode: ThemeMode): ThemeMode {
  return CYCLE[(CYCLE.indexOf(mode) + 1) % CYCLE.length]!;
}

export interface ThemeRoot {
  dataset: Record<string, string | undefined>;
}

export function applyThemeMode(root: ThemeRoot, mode: ThemeMode): void {
  if (mode === "auto") {
    delete root.dataset["theme"];
  } else {
    root.dataset["theme"] = mode;
  }
}

export const themeLabel = (mode: ThemeMode): string => `Theme: ${mode}`;
