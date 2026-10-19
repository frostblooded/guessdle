// API container entry: migrate, then serve /api on PORT
import { join } from "node:path";
import pg from "pg";
import { attachPartySockets, createApp } from "./app.ts";
import { adminEmailsFromEnv } from "./auth.ts";
import { mailDueAdmins } from "./lifecycle.ts";
import { mailConfigFromEnv } from "./mailer.ts";
import { migrate } from "./migrate.ts";
import { rateLimitFromEnv } from "./rate-limit.ts";
import { sweepParties } from "./parties.ts";
import { uploadRefs } from "./upload-refs.ts";

export const MIGRATIONS_DIR = join(import.meta.dirname, "../../db/migrations");

// Pool + migrations from DATABASE_URL; shared by the API container and the dev server
export async function connect(url: string): Promise<pg.Pool> {
  const pool = new pg.Pool({ connectionString: url });
  // An idle client losing its connection emits here; unhandled, it crashes the process
  pool.on("error", (err) => console.error("Idle database client error", err));
  const applied = await migrate(pool, MIGRATIONS_DIR);
  if (applied.length > 0) {
    console.log(`Applied migrations: ${applied.join(", ")}`);
  }
  return pool;
}

if (import.meta.main) {
  const url = process.env["DATABASE_URL"];
  if (!url) {
    throw new Error("DATABASE_URL is required");
  }
  const pool = await connect(url);
  const uploadsDir = process.env["UPLOADS_DIR"] || "uploads";
  // shortcut: sweeps at start and every 24h rather than at a fixed night hour; the 1-day grace makes timing irrelevant
  const sweep = (): void => {
    uploadRefs(pool, uploadsDir)
      .sweep(new Date())
      .then(
        (names) => {
          if (names.length > 0) {
            console.log(`Upload sweep removed ${names.length} files`);
          }
        },
        (err: unknown) => console.error("Upload sweep failed", err),
      );
  };
  sweep();
  setInterval(sweep, 24 * 3600_000).unref();
  // Ends idle parties and deletes old ones (reads also end an idle party on the spot)
  setInterval(() => {
    sweepParties(pool, new Date()).catch((err: unknown) =>
      console.error("Party sweep failed", err),
    );
  }, 3600_000).unref();
  const mail = mailConfigFromEnv(process.env);
  // Sends the admin email for games still pending 5 minutes after they were sent for approval
  if (mail) {
    setInterval(() => void mailDueAdmins(pool, mail), 60_000).unref();
  }
  const app = createApp({
    pool,
    timeZone: process.env["SERVER_TIMEZONE"],
    mail,
    adminEmails: adminEmailsFromEnv(process.env["ADMIN_EMAILS"]),
    secureCookies: true,
    limit: rateLimitFromEnv(process.env),
    backupDir: process.env["BACKUP_DIR"] || undefined,
    uploadsDir,
  });
  attachPartySockets(
    app.listen(Number(process.env["PORT"] ?? 3000), "0.0.0.0"),
    app,
  );
}
