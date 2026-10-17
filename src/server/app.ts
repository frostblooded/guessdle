import type { Server } from "node:http";
import express from "express";
import type { ErrorRequestHandler, Express } from "express";
import type pg from "pg";
import { DEFAULT_RATE_LIMIT, rateLimit, type RateLimit } from "./rate-limit.ts";
import { csrfGuard } from "./auth.ts";
import type { MailConfig } from "./mailer.ts";
import { answersRoutes } from "./routes/answers.ts";
import { adminRoutes } from "./routes/admin.ts";
import { authRoutes } from "./routes/auth.ts";
import type { AppContext } from "./routes/context.ts";
import { gameRoutes } from "./routes/game.ts";
import { manageRoutes } from "./routes/manage.ts";
import { partyRoutes } from "./routes/parties.ts";
import { createPartyHub, type PartyHub } from "./party-hub.ts";
import { shellRoutes } from "./routes/shell.ts";
import { uploadRoutes } from "./routes/uploads.ts";

export interface AppDeps {
  pool: pg.Pool;
  now?: () => Date;
  random?: () => number;
  // IANA zone whose midnight starts a new day
  timeZone?: string | undefined;
  // SMTP mailer and public URL for sign-in links; without them sign-in answers 503
  mail?: MailConfig | undefined;
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
  // Folder the upload pipeline writes WebP images to (served at /uploads/)
  uploadsDir?: string | undefined;
  // Per-user upload budget per window, and per-user stored bytes
  uploadLimit?: RateLimit;
  uploadQuotaBytes?: number;
  // Per-user budget for creating and editing games per window
  writeLimit?: RateLimit;
  // Folder holding game.html, the shell served at /g/<slug>
  shellDir?: string;
}

// Each app's party socket hub, for attachPartySockets
const hubs = new WeakMap<Express, PartyHub>();

// Party sockets need the HTTP server's upgrade event, which Express never sees (ADR 0016).
// Closing the server closes the hub.
export function attachPartySockets(server: Server, app: Express): void {
  const hub = hubs.get(app)!;
  server.on("upgrade", hub.upgrade);
  server.on("close", hub.close);
}

// The API only; callers add static files (dev server) or sit behind nginx (prod)
export function createApp({
  pool,
  now = (): Date => new Date(),
  random = Math.random,
  timeZone = "Europe/Sofia",
  mail,
  adminEmails = [],
  secureCookies = false,
  testLogin = false,
  limit = DEFAULT_RATE_LIMIT,
  backupDir = "/backups",
  uploadsDir = "uploads",
  uploadLimit,
  uploadQuotaBytes,
  writeLimit,
  shellDir = ".",
}: AppDeps): Express {
  if (testLogin && process.env["NODE_ENV"] === "production") {
    throw new Error("The test login route cannot run in production");
  }
  const ctx: AppContext = {
    pool,
    now,
    random,
    timeZone,
    secureCookies,
    mail,
  };
  const app = express();
  const hub = createPartyHub(ctx);
  hubs.set(app, hub);
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

  authRoutes(app, ctx, { mail, adminEmails, testLogin });
  adminRoutes(app, ctx, backupDir, uploadsDir);
  gameRoutes(app, ctx);
  manageRoutes(app, ctx, uploadsDir, writeLimit);
  uploadRoutes(app, ctx, uploadsDir, uploadLimit, uploadQuotaBytes);
  answersRoutes(app, ctx);
  partyRoutes(app, ctx, hub);
  shellRoutes(app, ctx, shellDir);

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
