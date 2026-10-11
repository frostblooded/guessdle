import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  forbidOnly: !!process.env["CI"],
  retries: process.env["CI"] ? 1 : 0,
  reporter: process.env["CI"] ? "github" : "list",
  use: {
    baseURL: "http://127.0.0.1:8080",
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "node server.mjs",
    cwd: "../..",
    url: "http://127.0.0.1:8080",
    reuseExistingServer: !process.env["CI"],
    timeout: 30_000,
  },
});
