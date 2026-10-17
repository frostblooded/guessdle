import { defineConfig } from "vitest/config";

// Unit tests run in parallel; integration tests share Testcontainers services, so they run one file at a time
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "unit",
          include: ["tests/*.test.ts"],
        },
      },
      {
        test: {
          name: "integration",
          include: ["tests/integration/*.test.ts"],
          fileParallelism: false,
          testTimeout: 120_000,
          hookTimeout: 120_000,
        },
      },
    ],
  },
});
