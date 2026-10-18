import { defineConfig, devices } from "@playwright/test";

// Own port so the tests never reuse a dev server started with `npm start`; E2E_PORT lets parallel runs (agents, worktrees) avoid each other
const PORT = Number(process.env["E2E_PORT"] ?? 8081);
const URL = `http://127.0.0.1:${PORT}`;
const CHROMIUM = process.env["PW_CHROMIUM_PATH"];

export default defineConfig({
  testDir: ".",
  forbidOnly: !!process.env["CI"],
  retries: process.env["CI"] ? 1 : 0,
  reporter: process.env["CI"] ? "github" : "list",
  use: {
    baseURL: URL,
    // Cloud sessions cannot download the matching Chromium; .claude/hooks/cloud-setup.mjs points this at the installed one
    launchOptions: CHROMIUM ? { executablePath: CHROMIUM } : {},
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    // Not npm start: serve.ts starts the Postgres container first (and skips .env)
    command: "node tests/e2e/serve.ts",
    env: { PORT: String(PORT) },
    cwd: "../..",
    url: URL,
    reuseExistingServer: !process.env["CI"],
    timeout: 180_000,
  },
});
