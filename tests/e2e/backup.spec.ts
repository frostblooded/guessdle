import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";

const STATUS = join(tmpdir(), "petdle-e2e-backups", "status.json");
const ago = (hours: number): string =>
  new Date(Date.now() - hours * 3600e3).toISOString();
const dump = (hours: number, ok = true): object => ({
  time: ago(hours),
  ok,
  file: "petdle-fixture.dump",
});

const openBackups = async (page: Page, admin = true): Promise<void> => {
  await page.request.post("/api/test/login", {
    data: { email: `backup-${Date.now()}@example.test`, admin },
  });
  await page.goto("/admin");
  await page.locator("#tab-backup").click();
};

test("a healthy backup shows the newest dump age without red", async ({
  page,
}) => {
  writeFileSync(
    STATUS,
    JSON.stringify({ lastDump: dump(0.5), lastRestore: dump(2) }),
  );
  await openBackups(page);
  await expect(page.locator("#backup-status")).toContainText("Newest dump: 0.");
  await expect(page.locator("#backup-status")).toHaveAttribute(
    "data-state",
    "ok",
  );
  await expect(page.locator("#backup-reasons li")).toHaveCount(0);
});

test("a stale dump is red", async ({ page }) => {
  writeFileSync(STATUS, JSON.stringify({ lastDump: dump(40) }));
  await openBackups(page);
  await expect(page.locator("#backup-status")).toHaveAttribute(
    "data-state",
    "red",
  );
  await expect(page.locator("#backup-reasons")).toContainText("36 hours");
});

test("a failed restore test is red and shows its error", async ({ page }) => {
  writeFileSync(
    STATUS,
    JSON.stringify({
      lastDump: dump(1),
      lastRestore: { ...dump(2, false), error: "pg_restore: boom" },
    }),
  );
  await openBackups(page);
  await expect(page.locator("#backup-status")).toHaveAttribute(
    "data-state",
    "red",
  );
  await expect(page.locator("#backup-reasons")).toContainText("boom");
});

test("an unreadable status file shows a clear error, not a crash", async ({
  page,
}) => {
  writeFileSync(STATUS, "{nope");
  await openBackups(page);
  await expect(page.locator("#backup-status")).toHaveAttribute(
    "data-state",
    "red",
  );
  await expect(page.locator("#backup-reasons")).toContainText("valid JSON");
});

test("the endpoint is admin only", async ({ page }) => {
  expect((await page.request.get("/api/admin/backup")).status()).toBe(401);
  await page.request.post("/api/test/login", {
    data: { email: `plain-${Date.now()}@example.test`, admin: false },
  });
  expect((await page.request.get("/api/admin/backup")).status()).toBe(403);
});
