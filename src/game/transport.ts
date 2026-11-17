import { failureText, UNREACHABLE } from "./failures.ts";

export type Fetch = (
  url: string,
  init?: { method: "POST"; headers: Record<string, string>; body: string },
) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

export interface Reply {
  ok: boolean;
  status: number;
  data: unknown;
}

export type Failure = "error" | "rate_limited";

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

export function failureMessage(res: Reply | null): string {
  return res === null
    ? UNREACHABLE
    : failureText((res.data as { error?: unknown } | null)?.error, res.status);
}

export type Refused =
  { kind: "rate_limited" } | { kind: "error"; message: string; code?: string };

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
