// Where to go after sign-in. The emailed link may open in another tab, so the target waits in localStorage.
const KEY = "returnTo";

// Same-site paths only: an open redirect must not survive a crafted ?next=
export const safeNext = (value: string | null): string | null =>
  value !== null && /^\/(?![/\\])/.test(value) && !/[\r\n]/.test(value)
    ? value
    : null;

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
