import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// Unit tests run in parallel. Integration files share one Postgres container (global-setup.ts), each with its own database.
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
          globalSetup: ["tests/integration/global-setup.ts"],
          testTimeout: 120_000,
          hookTimeout: 120_000,
        },
      },
    ],
  },
});
