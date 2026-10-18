// The phone's player token for each party; storage may be blocked, then it lasts this page view.
const tokens = new Map<string, string>();
const key = (code: string): string => `party:${code}`;

export function getToken(code: string): string | null {
  try {
    return localStorage.getItem(key(code)) ?? tokens.get(code) ?? null;
  } catch {
    return tokens.get(code) ?? null;
  }
}

export function setToken(code: string, token: string | null): void {
  if (token === null) {
    tokens.delete(code);
  } else {
    tokens.set(code, token);
  }
  try {
    if (token === null) {
      localStorage.removeItem(key(code));
    } else {
      localStorage.setItem(key(code), token);
    }
  } catch {
    // blocked storage: the in-memory copy above
  }
}
