import { failureText } from "./game/failures.ts";

export interface Reply<T = Record<string, unknown>> {
  status: number;
  data: T;
}

export async function api<T = Record<string, unknown>>(
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
  path: string,
  body?: unknown,
): Promise<Reply<T> | null> {
  try {
    const raw = body instanceof Blob;
    const res = await fetch(path, {
      method,
      ...(method !== "GET" && {
        headers: {
          "Content-Type": raw ? "application/octet-stream" : "application/json",
        },
      }),
      ...(body !== undefined && { body: raw ? body : JSON.stringify(body) }),
    });
    return { status: res.status, data: (await res.json()) as T };
  } catch {
    return null;
  }
}

export const signInThen = (path: string): void =>
  location.replace(`/login?next=${encodeURIComponent(path)}`);

export const errorText = (reply: Reply<unknown> | null): string =>
  reply === null
    ? "Could not reach the server. Check your connection and try again."
    : failureText(
        (reply.data as Record<string, unknown> | null)?.["error"],
        reply.status,
      );
