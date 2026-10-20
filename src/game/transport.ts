// The one fetch transport shared by anonymous play, signed-in play and merge.
import { failureText, UNREACHABLE } from "./failures.ts";

// The part of fetch that the game clients use
export type Fetch = (
  url: string,
  init?: { method: "POST"; headers: Record<string, string>; body: string },
) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

export interface Reply {
  ok: boolean;
  status: number;
  // Null for nginx's plain-text 429, or when the body was not read
  data: unknown;
}

// Why a request produced no usable reply: unreachable or unreadable, or too
// many requests (API JSON or nginx plain text)
export type Failure = "error" | "rate_limited";

// GET without a body, POST with one. Null on a network or body-parse failure;
// `readBody: false` skips parsing for callers that only look at the status.
export async function call(
  fetch: Fetch,
  url: string,
  body?: unknown,
  readBody: boolean = true,
): Promise<Reply | null> {
  try {
    const res = await fetch(
      url,
      body === undefined
        ? undefined
        : {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          },
    );
    return {
      ok: res.ok,
      status: res.status,
      data: res.status === 429 || !readBody ? null : await res.json(),
    };
  } catch {
    return null;
  }
}

// What to tell the player about a reply that was not a success: the server's own reason, or that
// it could not be reached at all
export function failureMessage(res: Reply | null): string {
  return res === null
    ? UNREACHABLE
    : failureText((res.data as { error?: unknown } | null)?.error, res.status);
}

// A request the server did not accept: too many requests, or the text of why not and the
// reply's failure code when it sent one
export type Refused =
  { kind: "rate_limited" } | { kind: "error"; message: string; code?: string };

// GET (no body) or POST: the parsed body of a success, or why there is none
export async function send<T>(
  fetch: Fetch,
  url: string,
  body?: unknown,
): Promise<T | Refused> {
  const res = await call(fetch, url, body);
  if (res?.status === 429) {
    return { kind: "rate_limited" };
  }
  if (res?.ok) {
    return res.data as T;
  }
  const code = (res?.data as { error?: unknown } | null)?.error;
  return {
    kind: "error",
    message: failureMessage(res),
    ...(typeof code === "string" && { code }),
  };
}

export function failureOf(res: Reply | null): Failure | null {
  if (res === null) {
    return "error";
  }
  return res.status === 429 ? "rate_limited" : null;
}
