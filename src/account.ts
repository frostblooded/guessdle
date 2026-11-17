import { call, failureOf, type Fetch } from "./game/transport.ts";

export interface AccountUser {
  name: string;
  email: string;
  username: string | null;
  admin: boolean;
  friendRequests: number;
  pending?: number;
  banned?: true;
  banReason?: string;
}

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

export type VerifyResult = "ok" | "invalid" | "rate_limited" | "error";

export async function verifyLoginToken(
  fetch: Fetch,
  token: string,
): Promise<VerifyResult> {
  const res = await call(fetch, "/api/auth/email/verify", { token }, false);
  if (res === null) {
    return "error";
  }
  if (res.status === 429) {
    return "rate_limited";
  }
  return res.ok ? "ok" : res.status === 400 ? "invalid" : "error";
}
