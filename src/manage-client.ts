// Browser side of creating and editing games: JSON calls, the sign-in detour and error texts.
import { failureText } from "./game/failures.ts";

export interface Reply<T = Record<string, unknown>> {
  status: number;
  data: T;
}

// JSON request, or raw bytes when `body` is a File; null when the server could not be reached
export async function api<T = Record<string, unknown>>(
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
  path: string,
  body?: unknown,
): Promise<Reply<T> | null> {
  try {
    const raw = body instanceof Blob;
    const res = await fetch(path, {
      method,
      // The CSRF guard wants JSON or raw bytes on every mutating call, DELETE included
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

// Signed-out visitors sign in and come back to `path`
export const signInThen = (path: string): void =>
  location.replace(`/login?next=${encodeURIComponent(path)}`);

export const errorText = (reply: Reply<unknown> | null): string =>
  reply === null
    ? "Could not reach the server. Check your connection and try again."
    : failureText(
        (reply.data as Record<string, unknown> | null)?.["error"],
        reply.status,
      );
