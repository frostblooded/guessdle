// Dev static file server. Serves the built app shell from dist/ (npm run build first) and only what it loads.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, relative, resolve, sep } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const DIST = join(ROOT, "dist");
const PORT = process.env.PORT ?? 8080;

// The app's routes (src/App.tsx) get the shell with 200; deploy/nginx.conf lists the same ones
const ROUTES =
  /^\/(|login|verify|admin|how-to-play|create|my-games|g\/[^/]+|g\/[^/]+\/edit)$/;
// Paths under the repo root the app loads
const ALLOWED = /^\/(favicon\.ico|(dist|uploads)\/.+)$/;

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".map": "application/json",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

// Absolute path of the file a URL may read, or null if the page may not load it
function allowedFile(urlPath) {
  try {
    if (ROUTES.test(urlPath)) return join(DIST, "index.html");
    const file = resolve(join(ROOT, decodeURIComponent(urlPath)));
    // Test the resolved path, so an encoded "..%2f" cannot escape the allowlist
    const path = "/" + relative(ROOT, file).split(sep).join("/");
    return ALLOWED.test(path) ? file : null;
  } catch {
    return null;
  }
}

async function serveStatic(req, res) {
  const file = allowedFile(new URL(req.url, "http://localhost").pathname);
  const body = file === null ? null : await readFile(file).catch(() => null);
  // Anything else is a real 404; the shell still loads and shows the app's not-found page
  if (body === null)
    return res
      .writeHead(404, { "Content-Type": TYPES[".html"] })
      .end(await readFile(join(DIST, "index.html")));

  res.writeHead(200, {
    "Content-Type": TYPES[extname(file)] ?? "application/octet-stream",
  });
  res.end(body);
}

// With DATABASE_URL the Express API (src/server) runs in this process; the e2e suite leaves it unset.
let handler = serveStatic;
let sockets = null;
if (process.env.DATABASE_URL) {
  const { connect } = await import("../src/server/main.ts");
  const { attachPartySockets, createApp } =
    await import("../src/server/app.ts");
  const { adminEmailsFromEnv } = await import("../src/server/auth.ts");
  const { mailConfigFromEnv } = await import("../src/server/mailer.ts");
  const { rateLimitFromEnv } = await import("../src/server/rate-limit.ts");
  const app = createApp({
    pool: await connect(process.env.DATABASE_URL),
    timeZone: process.env.SERVER_TIMEZONE || undefined,
    mail: mailConfigFromEnv(process.env),
    limit: rateLimitFromEnv(process.env),
    backupDir: process.env.BACKUP_DIR || undefined,
    uploadsDir: process.env.UPLOADS_DIR || join(ROOT, "uploads"),
    shellDir: DIST,
    adminEmails: adminEmailsFromEnv(process.env.ADMIN_EMAILS),
    // Only the e2e suite sets NODE_ENV=test; the stub login never exists elsewhere
    testLogin: process.env.NODE_ENV === "test",
  });
  app.use(serveStatic);
  handler = app;
  sockets = (server) => attachPartySockets(server, app);
}
const server = createServer(handler).listen(PORT, "0.0.0.0");
sockets?.(server);
