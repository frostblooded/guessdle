const KEY = "returnTo";

const HOME = "https://guessdle.invalid";
export const safeNext = (value: string | null): string | null => {
  if (
    value === null ||
    !value.startsWith("/") ||
    [...value].some((c) => c <= " " || c === "\u007f" || c === "\\")
  ) {
    return null;
  }
  try {
    return new URL(value, HOME).origin === HOME ? value : null;
  } catch {
    return null;
  }
};

export function rememberReturnTo(storage: Storage, value: string | null): void {
  const next = safeNext(value);
  try {
    if (next !== null) {
      storage.setItem(KEY, next);
    }
  } catch {}
}

export function takeReturnTo(storage: Storage): string {
  try {
    const next = safeNext(storage.getItem(KEY));
    storage.removeItem(KEY);
    return next ?? "/";
  } catch {
    return "/";
  }
}
