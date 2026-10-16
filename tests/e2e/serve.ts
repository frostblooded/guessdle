// Playwright web server: a throwaway real Postgres (Testcontainers; reaped on
// exit) behind the dev server, so the e2e suite runs against the real API.
import { mkdirSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PostgreSqlContainer } from "@testcontainers/postgresql";
import { publishMailpitUrl, startMailpit } from "../integration/mailpit.ts";

const container = await new PostgreSqlContainer("postgres:17-alpine").start();
// Sign-in mail goes to a throwaway Mailpit; the specs read it back through its API
const mailpit = await startMailpit();
publishMailpitUrl(mailpit.apiUrl);
process.env["SMTP_HOST"] = "127.0.0.1";
process.env["SMTP_PORT"] = String(mailpit.smtpPort);
process.env["PUBLIC_URL"] = `http://127.0.0.1:${process.env["PORT"]}`;
process.env["NODE_ENV"] = "test";
// The suite fires far more than the per-minute budget from one IP
process.env["RATE_LIMIT_MAX"] = "100000";
process.env["DATABASE_URL"] = container.getConnectionUri();
// Fixture backups volume: a fresh dump; backup.spec.ts rewrites status.json
const backups = join(tmpdir(), "petdle-e2e-backups");
mkdirSync(join(backups, "daily"), { recursive: true });
writeFileSync(join(backups, "daily", "petdle-fixture.dump"), "x");
utimesSync(
  join(backups, "daily", "petdle-fixture.dump"),
  new Date(),
  new Date(),
);
process.env["BACKUP_DIR"] = backups;
const server = "../../scripts/server.mjs";
await import(server);
