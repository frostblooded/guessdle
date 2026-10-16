// API container entry: migrate, then serve /api on PORT
import { join } from "node:path";
import pg from "pg";
import { createApp } from "./app.ts";
import { migrate } from "./migrate.ts";

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
  createApp({ pool }).listen(Number(process.env["PORT"] ?? 3000), "0.0.0.0");
}
