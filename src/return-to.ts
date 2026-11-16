// Where to go after sign-in. The emailed link may open in another tab, so the target waits in localStorage.
const KEY = "returnTo";

// Same-site paths only: an open redirect must not survive a crafted ?next=
// Browsers drop tabs and newlines and read a backslash as "/" while parsing, so "/\t/evil.test" became
// "//evil.test": refuse controls, spaces and backslashes, then check the parsed origin too.
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
  } catch {
    // blocked storage: sign-in lands on the gallery
  }
}

// The remembered target (once), or "/"
export function takeReturnTo(storage: Storage): string {
  try {
    const next = safeNext(storage.getItem(KEY));
    storage.removeItem(KEY);
    return next ?? "/";
  } catch {
    return "/";
  }
}
