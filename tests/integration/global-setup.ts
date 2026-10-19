// One Postgres container for the whole integration run; each file gets its own
// database in it (postgres.ts), so files can run in parallel
import { PostgreSqlContainer } from "@testcontainers/postgresql";
import type { TestProject } from "vitest/node";

declare module "vitest" {
  export interface ProvidedContext {
    postgresUri: string;
  }
}

export default async function setup(
  project: TestProject,
): Promise<() => Promise<void>> {
  const container = await new PostgreSqlContainer("postgres:17-alpine").start();
  project.provide("postgresUri", container.getConnectionUri());
  return async () => {
    await container.stop();
  };
}
