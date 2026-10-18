// The warning line on Play after an action the server refused

export const RATE_LIMITED =
  "Too many requests in a short time. Wait a minute, then try again.";

// The notice after an action: why the server refused it, or none
export const noticeOf = (res: {
  kind: string;
  message?: string;
}): string | null =>
  res.kind === "rate_limited"
    ? RATE_LIMITED
    : res.kind === "error"
      ? (res.message ?? null)
      : null;
