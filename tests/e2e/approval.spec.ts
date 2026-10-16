import { expect, test } from "@playwright/test";
import { mailTo, publishedMailpitUrl } from "../integration/mailpit.ts";

let counter = 0;
const unique = (): string =>
  `${Date.now().toString(36)}${counter++}${Math.random().toString(36).slice(2, 6)}`;

test("submit, admin reject, resubmit, approve, unpublish", async ({
  page,
  browser,
  baseURL,
}) => {
  const id = unique();
  const adminEmail = `approver-${id}@example.test`;
  const admin = await (
    await browser.newContext({ baseURL: baseURL! })
  ).newPage();
  await admin.request.post("/api/test/login", {
    data: { email: adminEmail, admin: true },
  });

  await page.request.post("/api/test/login", {
    data: { email: `owner-${id}@example.test` },
  });
  const name = `Approval ${id}`;
  const { slug } = (await (
    await page.request.post("/api/games", { data: { name } })
  ).json()) as { slug: string };
  await page.request.post(`/api/games/${slug}/entries`, {
    data: { name: "One" },
  });

  await page.goto(`/g/${slug}/edit`);
  await expect(page.locator("#loading-state")).toBeHidden();
  // One entry is not enough
  await expect(page.locator("#submit-button")).toBeDisabled();
  await page.request.post(`/api/games/${slug}/entries`, {
    data: { name: "Two" },
  });
  await page.reload();
  await expect(page.locator("#loading-state")).toBeHidden();
  await page.locator("#submit-button").click();
  await expect(page.locator("#status-notice")).toContainText("Pending");
  await expect(page.locator("#submit-button")).toBeHidden();

  // The admin was mailed, sees the count and rejects with a reason
  const mail = await mailTo(publishedMailpitUrl(), adminEmail);
  expect(mail.Text).toContain(`/g/${slug}`);
  await admin.goto("/");
  await admin.locator("#user-menu-button").click();
  await expect(admin.locator("#admin-link")).toContainText(/Admin \(\d+\)/);
  await admin.locator("#admin-link").click();
  await admin.locator("#tab-queue").click();
  const row = admin.locator(`#queue-games tr[data-slug="${slug}"]`);
  await expect(row).toBeVisible();
  await expect(row.getByRole("link", { name })).toHaveAttribute(
    "href",
    `/g/${slug}`,
  );
  admin.once("dialog", (dialog) => void dialog.accept("Too vague"));
  await row.getByRole("button", { name: "Reject" }).click();
  await expect(row).toBeHidden();

  await page.reload();
  await expect(page.locator("#loading-state")).toBeHidden();
  await expect(page.locator("#status-notice")).toContainText("Too vague");
  await page.locator("#submit-button").click();
  await expect(page.locator("#status-notice")).toContainText("Pending");

  await admin.reload();
  await admin.locator("#tab-queue").click();
  await row.getByRole("button", { name: "Approve" }).click();
  await expect(row).toBeHidden();
  await page.goto("/");
  await expect(page.locator("#gallery-loading")).toBeHidden();
  await expect(page.locator(".game-card", { hasText: name })).toBeVisible();

  await page.goto(`/g/${slug}/edit`);
  await expect(page.locator("#loading-state")).toBeHidden();
  await page.locator("#unpublish-button").click();
  await expect(page.locator("#status-notice")).toContainText("Pending");
  await page.goto("/");
  await expect(page.locator("#gallery-loading")).toBeHidden();
  await expect(page.locator(".game-card", { hasText: name })).toHaveCount(0);

  // An admin can delete a queued game
  admin.once("dialog", (dialog) => void dialog.accept());
  await admin.reload();
  await admin.locator("#tab-queue").click();
  await row.getByRole("button", { name: "Delete" }).click();
  await expect(row).toBeHidden();
  expect((await page.request.get(`/api/games/${slug}`)).status()).toBe(404);
});
