// Browser side of sign-in: who is signed in, and signing out.

export interface AccountUser {
  name: string;
  email: string;
  admin: boolean;
}

export interface AccountFetch {
  (
    url: string,
    init?: { method: "POST"; headers: Record<string, string>; body: string },
  ): Promise<{ ok: boolean; json(): Promise<unknown> }>;
}

// null when signed out, or when the server cannot be reached (shown as signed out)
export async function fetchUser(
  fetch: AccountFetch,
): Promise<AccountUser | null> {
  try {
    const res = await fetch("/api/me");
    if (!res.ok) {
      return null;
    }
    const body = (await res.json()) as { user?: AccountUser | null };
    return body.user ?? null;
  } catch {
    return null;
  }
}

// True once the server has ended the session
export async function signOut(fetch: AccountFetch): Promise<boolean> {
  try {
    const res = await fetch("/api/auth/logout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    return res.ok;
  } catch {
    return false;
  }
}
