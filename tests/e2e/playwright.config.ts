import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  forbidOnly: !!process.env["CI"],
  retries: process.env["CI"] ? 1 : 0,
  reporter: process.env["CI"] ? "github" : "list",
  use: {
    baseURL: "http://localhost:8080",
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "cargo run",
    cwd: "../..",
    url: "http://localhost:8080",
    reuseExistingServer: !process.env["CI"],
    timeout: 300_000,
  },
});
