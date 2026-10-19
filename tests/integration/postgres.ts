import { randomBytes } from "node:crypto";
import pg from "pg";
import { inject } from "vitest";

export interface TestDb {
  pool: pg.Pool;
  stop(): Promise<void>;
}

// A fresh empty database per test file, in the one Postgres container that
// global-setup.ts starts for the whole run
export async function startDb(): Promise<TestDb> {
  const url = new URL(inject("postgresUri"));
  const admin = new pg.Client({ connectionString: url.href });
  await admin.connect();
  const name = `test_${randomBytes(6).toString("hex")}`;
  await admin.query(`CREATE DATABASE ${name}`);
  await admin.end();
  url.pathname = `/${name}`;
  const pool = new pg.Pool({ connectionString: url.href });
  return {
    pool,
    async stop(): Promise<void> {
      await pool.end();
    },
  };
}
