// Browser side of sign-in: who is signed in, and signing out.
import { call, failureOf, type Fetch } from "./game/transport.ts";

export interface AccountUser {
  name: string;
  email: string;
  admin: boolean;
}

// null when signed out, or when the server cannot be reached (shown as signed out)
export async function fetchUser(fetch: Fetch): Promise<AccountUser | null> {
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
export async function signOut(fetch: Fetch): Promise<boolean> {
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

export type LinkRequest =
  "sent" | "invalid" | "unavailable" | "rate_limited" | "error";

// Asks the server to email a sign-in link
export async function requestLoginLink(
  fetch: Fetch,
  email: string,
): Promise<LinkRequest> {
  const res = await call(fetch, "/api/auth/email/request", { email });
  if (res === null) {
    return "error";
  }
  if (res.ok) {
    return "sent";
  }
  const failure = failureOf(res);
  if (failure !== null) {
    return failure;
  }
  return res.status === 400
    ? "invalid"
    : res.status === 503
      ? "unavailable"
      : "error";
}

// True when the emailed token was valid and the session cookie is now set
export async function verifyLoginToken(
  fetch: Fetch,
  token: string,
): Promise<boolean> {
  const res = await call(fetch, "/api/auth/email/verify", { token }, false);
  return res?.ok === true;
}
