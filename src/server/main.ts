// API container entry: migrate, then serve /api on PORT
import { join } from "node:path";
import pg from "pg";
import { createApp } from "./app.ts";
import { adminEmailsFromEnv } from "./auth.ts";
import { mailConfigFromEnv } from "./mailer.ts";
import { migrate } from "./migrate.ts";
import { rateLimitFromEnv } from "./rate-limit.ts";

export const MIGRATIONS_DIR = join(import.meta.dirname, "../../db/migrations");

// Pool + migrations from DATABASE_URL; shared by the API container and the dev server
export async function connect(url: string): Promise<pg.Pool> {
  const pool = new pg.Pool({ connectionString: url });
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
  createApp({
    pool,
    timeZone: process.env["SERVER_TIMEZONE"],
    mail: mailConfigFromEnv(process.env),
    adminEmails: adminEmailsFromEnv(process.env["ADMIN_EMAILS"]),
    secureCookies: true,
    limit: rateLimitFromEnv(process.env),
    backupDir: process.env["BACKUP_DIR"] || undefined,
  }).listen(Number(process.env["PORT"] ?? 3000), "0.0.0.0");
}
