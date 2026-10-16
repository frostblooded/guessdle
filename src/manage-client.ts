// Browser side of creating and editing games: JSON calls, the sign-in detour and error texts.

export interface Reply<T = Record<string, unknown>> {
  status: number;
  data: T;
}

// JSON request, or raw bytes when `body` is a File; null when the server could not be reached
export async function api<T = Record<string, unknown>>(
  method: "GET" | "POST" | "PATCH",
  path: string,
  body?: unknown,
): Promise<Reply<T> | null> {
  try {
    const raw = body instanceof Blob;
    const res = await fetch(path, {
      method,
      ...(body !== undefined && {
        headers: {
          "Content-Type": raw ? "application/octet-stream" : "application/json",
        },
        body: raw ? body : JSON.stringify(body),
      }),
    });
    return { status: res.status, data: (await res.json()) as T };
  } catch {
    return null;
  }
}

// Signed-out visitors sign in and come back to `path`
export const signInThen = (path: string): void =>
  location.replace(`/login?next=${encodeURIComponent(path)}`);

const ERRORS: Record<string, string> = {
  invalid: "Check the values and try again.",
  reserved: "That address is reserved. Pick another one.",
  slug_taken: "That address is already taken. Pick another one.",
  rate_limited: "Too many changes in a short time. Wait a minute and retry.",
  unauthorized: "Your session ended. Sign in again.",
  forbidden: "You cannot change this game.",
  not_found: "This game no longer exists.",
  unsupported: "Use a JPEG, PNG or WebP image.",
  too_large: "That image is over 5 MB.",
  corrupt: "That image could not be read.",
  quota_exceeded: "You have used all your upload space.",
};

export const errorText = (reply: Reply | null): string =>
  reply === null
    ? "Could not reach the server. Check your connection and try again."
    : (ERRORS[String(reply.data["error"])] ??
      (reply.status === 429
        ? ERRORS["rate_limited"]!
        : "Something went wrong. Try again."));
