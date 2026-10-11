import { defineConfig, devices } from "@playwright/test";

// Own port so the tests never reuse a dev server started with `npm start`
const PORT = 8081;
const URL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: ".",
  forbidOnly: !!process.env["CI"],
  retries: process.env["CI"] ? 1 : 0,
  reporter: process.env["CI"] ? "github" : "list",
  use: {
    baseURL: URL,
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm start",
    env: { PORT: String(PORT) },
    cwd: "../..",
    url: URL,
    reuseExistingServer: !process.env["CI"],
    timeout: 30_000,
  },
});
