// Playwright web server: a throwaway real Postgres (Testcontainers; reaped on
// exit) behind the dev server, so the e2e suite runs against the real API.
import { PostgreSqlContainer } from "@testcontainers/postgresql";

const container = await new PostgreSqlContainer("postgres:17-alpine").start();
process.env["DATABASE_URL"] = container.getConnectionUri();
const server = "../../scripts/server.mjs";
await import(server);
