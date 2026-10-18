import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// Unit tests run in parallel; integration tests share Testcontainers services, so they run one file at a time.
// UI tests render React components in jsdom with Testing Library.
export default defineConfig({
  plugins: [react()],
  test: {
    projects: [
      {
        test: {
          name: "unit",
          include: ["tests/*.test.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "ui",
          include: ["tests/ui/*.test.tsx"],
          environment: "jsdom",
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
