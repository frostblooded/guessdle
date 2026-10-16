import type { RequestHandler } from "express";
import type pg from "pg";
import { sessionToken, userForSession } from "./auth.ts";

export interface RateLimit {
  max: number;
  windowMs: number;
}

// Starting values, tune after launch (docs/deploy.md); nginx limits per IP before this
export const DEFAULT_RATE_LIMIT: RateLimit = { max: 120, windowMs: 60_000 };

// Fixed-window counter per signed-in user, or per IP for everyone else.
// shortcut: in memory, so it resets on restart and is per process; use a shared store if the API ever scales out
export function rateLimit(
  pool: pg.Pool,
  now: () => Date,
  { max, windowMs }: RateLimit,
): RequestHandler {
  const windows = new Map<string, { start: number; count: number }>();
  return async (req, res, next) => {
    try {
      const time = now().getTime();
      for (const [key, w] of windows) {
        if (windows.size < 10_000) {
          break;
        }
        if (time - w.start >= windowMs) {
          windows.delete(key);
        }
      }
      const user = await userForSession(pool, sessionToken(req), now());
      const key = user ? `user:${user.id}` : `ip:${req.ip}`;
      let w = windows.get(key);
      if (!w || time - w.start >= windowMs) {
        w = { start: time, count: 0 };
        windows.set(key, w);
      }
      if (++w.count > max) {
        res
          .status(429)
          .set(
            "Retry-After",
            String(Math.ceil((w.start + windowMs - time) / 1000)),
          )
          .json({ error: "rate_limited" });
        return;
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}

// RATE_LIMIT_MAX / RATE_LIMIT_WINDOW_MS override the defaults (the e2e suite raises them)
export function rateLimitFromEnv(env: NodeJS.ProcessEnv): RateLimit {
  return {
    max: Number(env["RATE_LIMIT_MAX"] ?? DEFAULT_RATE_LIMIT.max),
    windowMs: Number(
      env["RATE_LIMIT_WINDOW_MS"] ?? DEFAULT_RATE_LIMIT.windowMs,
    ),
  };
}
