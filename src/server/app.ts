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
import { maintenanceRoutes } from "./routes/maintenance.ts";
import { shellRoutes } from "./routes/shell.ts";
import { uploadRoutes } from "./routes/uploads.ts";
import { blurRoutes } from "./routes/blur.ts";
import { quizRoutes } from "./routes/quiz.ts";
import { playlistRoutes } from "./routes/playlists.ts";
import { friendRoutes } from "./routes/friends.ts";
import { settingsRoutes } from "./routes/settings.ts";
import { tutorialRoutes } from "./routes/tutorial.ts";

export interface AppDeps {
  pool: pg.Pool;
  now?: () => Date;
  random?: () => number;
  timeZone?: string | undefined;
  mail?: MailConfig | undefined;
  adminEmails?: readonly string[];
  secureCookies?: boolean;
  testLogin?: boolean;
  limit?: RateLimit;
  backupDir?: string | undefined;
  uploadsDir?: string | undefined;
  uploadLimit?: RateLimit;
  uploadQuotaBytes?: number;
  writeLimit?: RateLimit;
  shellDir?: string;
}

const hubs = new WeakMap<Express, PartyHub>();

export function attachPartySockets(server: Server, app: Express): void {
  const hub = hubs.get(app)!;
  server.on("upgrade", (req, socket, head) => {
    try {
      hub.upgrade(req, socket, head);
    } catch (error) {
      console.error("party socket upgrade failed", error);
      socket.destroy();
    }
  });
  server.on("close", hub.close);
}

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
  app.set("trust proxy", 1);
  const limiter = rateLimit(pool, now, limit);
  app.use(
    "/api",
    (req, res, next) =>
      req.method === "GET" && req.path.startsWith("/parties/")
        ? next()
        : limiter(req, res, next),
    csrfGuard,
  );
  app.get("/api/health", async (_req, res) => {
    try {
      await pool.query("select 1");
      res.json({ status: "ok" });
    } catch {
      res.status(503).json({ status: "unavailable" });
    }
  });

  maintenanceRoutes(app, ctx);
  authRoutes(app, ctx, { adminEmails, testLogin });
  adminRoutes(app, ctx, backupDir, uploadsDir);
  gameRoutes(app, ctx);
  quizRoutes(app, ctx);
  manageRoutes(app, ctx, uploadsDir, writeLimit);
  uploadRoutes(app, ctx, uploadsDir, uploadLimit, uploadQuotaBytes);
  answersRoutes(app, ctx);
  partyRoutes(app, ctx, hub);
  blurRoutes(app, ctx, uploadsDir);
  playlistRoutes(app, ctx, writeLimit);
  friendRoutes(app, ctx, writeLimit);
  settingsRoutes(app, ctx);
  tutorialRoutes(app, ctx);
  shellRoutes(app, ctx, shellDir);

  app.use("/api", (_req, res) => {
    res.status(404).json({ error: "not_found" });
  });
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
