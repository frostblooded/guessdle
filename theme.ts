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

// The parts of the page Theme drives: <html> and the toggle button
export interface ThemeRoot {
  dataset: Record<string, string | undefined>;
}

export interface ThemeButton {
  textContent: string | null;
  setAttribute(name: string, value: string): void;
  addEventListener(type: "click", listener: () => void): void;
}

// Applies the stored mode, then cycles and stores it on each button click
export function initTheme(
  root: ThemeRoot,
  button: ThemeButton,
  storage: ThemeStorage,
): void {
  let mode: ThemeMode = readThemeMode(storage);

  const apply = (): void => {
    if (mode === "auto") {
      delete root.dataset["theme"];
    } else {
      root.dataset["theme"] = mode;
    }
    button.textContent = `Theme: ${mode}`;
    button.setAttribute("aria-label", `Theme: ${mode}. Click to change.`);
  };

  apply();
  button.addEventListener("click", (): void => {
    mode = nextThemeMode(mode);
    writeThemeMode(storage, mode);
    apply();
  });
}
