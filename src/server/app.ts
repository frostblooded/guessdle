import express from "express";
import type { ErrorRequestHandler, Express } from "express";
import type pg from "pg";
import { GUESS_DATA, type Pet } from "../game/roster.ts";
import { DEFAULT_RATE_LIMIT, rateLimit, type RateLimit } from "./rate-limit.ts";
import { csrfGuard, type GoogleConfig } from "./auth.ts";
import { adminRoutes } from "./routes/admin.ts";
import { authRoutes } from "./routes/auth.ts";
import type { AppContext } from "./routes/context.ts";
import { gameRoutes } from "./routes/game.ts";

export interface AppDeps {
  pool: pg.Pool;
  roster?: readonly Pet[];
  now?: () => Date;
  random?: () => number;
  // IANA zone whose midnight starts a new day
  timeZone?: string | undefined;
  // Google OAuth credentials; without them the sign-in routes answer 503
  google?: GoogleConfig | undefined;
  // Lowercase emails promoted to admin on sign-in
  adminEmails?: readonly string[];
  // Mark the session cookie Secure (HTTPS deployments)
  secureCookies?: boolean;
  // Mounts POST /api/test/login for e2e; only the test environment sets it
  testLogin?: boolean;
  // Per-user (anonymous: per-IP) request budget per window
  limit?: RateLimit;
  // Backups volume (read-only) holding status.json for the admin panel
  backupDir?: string | undefined;
}

// The API only; callers add static files (dev server) or sit behind nginx (prod)
export function createApp({
  pool,
  roster = GUESS_DATA,
  now = (): Date => new Date(),
  random = Math.random,
  timeZone = "Europe/Sofia",
  google,
  adminEmails = [],
  secureCookies = false,
  testLogin = false,
  limit = DEFAULT_RATE_LIMIT,
  backupDir = "/backups",
}: AppDeps): Express {
  if (testLogin && process.env["NODE_ENV"] === "production") {
    throw new Error("The test login route cannot run in production");
  }
  const ctx: AppContext = {
    pool,
    roster,
    petIds: roster.map((pet) => pet.id),
    now,
    random,
    timeZone,
    secureCookies,
  };
  const app = express();
  // One hop: nginx (or nothing in dev) sets X-Forwarded-For to the real client IP
  app.set("trust proxy", 1);
  app.use("/api", rateLimit(pool, now, limit), csrfGuard);
  app.get("/api/health", async (_req, res) => {
    try {
      await pool.query("select 1");
      res.json({ status: "ok" });
    } catch {
      res.status(503).json({ status: "unavailable" });
    }
  });

  authRoutes(app, ctx, { google, adminEmails, testLogin });
  adminRoutes(app, ctx, backupDir);
  gameRoutes(app, ctx);

  app.use("/api", (_req, res) => {
    res.status(404).json({ error: "not_found" });
  });
  // Body-parser failures (malformed JSON, over the size cap) carry a 4xx status
  const onError: ErrorRequestHandler = (err, _req, res, _next) => {
    const status: unknown = (err as { status?: unknown }).status;
    if (typeof status === "number" && status >= 400 && status < 500) {
      res.status(status).json({ error: "invalid" });
      return;
    }
    console.error(err);
    res.status(500).json({ error: "server_error" });
  };
  app.use(onError);
  return app;
}
