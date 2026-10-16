import { expect, test } from "@playwright/test";

let counter = 0;
const unique = (): string =>
  `${Date.now().toString(36)}${counter++}${Math.random().toString(36).slice(2, 6)}`;

test("an owner deletes their game after confirming, and cancelling keeps it", async ({
  page,
}) => {
  await page.request.post("/api/test/login", {
    data: { email: `del-owner-${unique()}@example.test` },
  });
  const name = `Doomed ${unique()}`;
  const { slug } = (await (
    await page.request.post("/api/games", { data: { name } })
  ).json()) as { slug: string };

  await page.goto("/my-games");
  await expect(page.locator("#mine-loading")).toBeHidden();
  const del = page.getByRole("button", { name: `Delete ${name}` });
  page.once("dialog", (dialog) => void dialog.dismiss());
  await del.click();
  await expect(del).toBeVisible();
  expect((await page.request.get(`/api/games/${slug}/details`)).status()).toBe(
    200,
  );

  page.once("dialog", (dialog) => void dialog.accept());
  await del.click();
  await expect(del).toHaveCount(0);
  await expect(page.locator("#mine-empty")).toBeVisible();
  expect((await page.request.get(`/api/games/${slug}/details`)).status()).toBe(
    404,
  );
});

test("an admin finds a game in All games, deletes it, then deletes its owner", async ({
  page,
  browser,
  baseURL,
}) => {
  const id = unique();
  const ownerEmail = `del-user-${id}@example.test`;
  const owner = await (
    await browser.newContext({ baseURL: baseURL! })
  ).newPage();
  await owner.request.post("/api/test/login", { data: { email: ownerEmail } });
  const names = [`Alpha ${id}`, `Beta ${id}`];
  for (const name of names) {
    await owner.request.post("/api/games", { data: { name } });
  }

  await page.request.post("/api/test/login", {
    data: { email: `del-admin-${id}@example.test`, admin: true },
  });
  await page.goto("/admin");
  await page.locator("#tab-games").click();
  await page.locator("#games-search").fill(`Alpha ${id}`);
  const alpha = page.locator("#all-games tr", { hasText: names[0]! });
  await expect(alpha).toHaveCount(1);
  await expect(page.locator("#all-games tr")).toHaveCount(1);
  await expect(alpha).toContainText(ownerEmail);
  page.once("dialog", (dialog) => void dialog.accept());
  await alpha.getByRole("button", { name: "Delete" }).click();
  await expect(page.locator("#games-message")).toContainText("No games match");

  await page.locator("#games-search").fill(`Beta ${id}`);
  await expect(page.locator("#all-games tr")).toHaveCount(1);

  // Deleting the owner takes their remaining game along
  await page.locator("#tab-users").click();
  const row = page.locator(`#admin-users tr[data-email="${ownerEmail}"]`);
  page.once("dialog", (dialog) => void dialog.accept());
  await row.getByRole("button", { name: "DELETE" }).click();
  await expect(row).toHaveCount(0);
  await page.locator("#tab-games").click();
  await expect(page.locator("#games-message")).toContainText("No games match");
});
