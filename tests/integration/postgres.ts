import { PostgreSqlContainer } from "@testcontainers/postgresql";
import type { StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import pg from "pg";

export interface TestDb {
  pool: pg.Pool;
  stop(): Promise<void>;
}

// A throwaway real Postgres per test file
export async function startDb(): Promise<TestDb> {
  const container: StartedPostgreSqlContainer = await new PostgreSqlContainer(
    "postgres:17-alpine",
  ).start();
  const pool = new pg.Pool({ connectionString: container.getConnectionUri() });
  return {
    pool,
    async stop(): Promise<void> {
      await pool.end();
      await container.stop();
    },
  };
}
