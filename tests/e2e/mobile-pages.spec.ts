import { expect, test, type Locator, type Page } from "@playwright/test";

// Smallest supported phone (spec #66, Testing Decisions)
test.use({ viewport: { width: 320, height: 568 } });

let counter = 0;
const unique = (): string =>
  `${Date.now().toString(36)}${counter++}${Math.random().toString(36).slice(2, 6)}`;

async function noSidewaysScroll(page: Page): Promise<void> {
  const [scroll, client] = await page.evaluate(() => [
    document.documentElement.scrollWidth,
    document.documentElement.clientWidth,
  ]);
  expect(scroll).toBeLessThanOrEqual(client!);
}

// The control is shown and lies fully inside the screen's width
async function onScreen(...controls: Locator[]): Promise<void> {
  for (const control of controls) {
    await expect(control).toBeVisible();
    const box = (await control.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(320);
  }
}

test("the gallery, Create, My games and the editor fit a 320px phone", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator("#gallery-loading")).toBeHidden();
  await onScreen(page.locator(".game-card").first());
  await noSidewaysScroll(page);

  await page.request.post("/api/test/login", {
    data: { email: `mobile-${unique()}@example.test` },
  });
  await page.goto("/create");
  await onScreen(
    page.locator("#game-name"),
    page.locator("#game-slug"),
    page.locator("#create-button"),
  );
  await noSidewaysScroll(page);

  await page.locator("#game-name").fill(`Phone ${unique()}`);
  await page.locator("#create-button").click();
  await expect(page).toHaveURL(/\/g\/[^/]+\/edit$/);
  await expect(page.locator("#loading-state")).toBeHidden();
  for (const tab of ["details", "attributes", "entries", "answers"]) {
    await page.locator(`#tab-${tab}`).click();
    await onScreen(page.locator(`#tab-${tab}`));
    await noSidewaysScroll(page);
  }
  await page.locator("#tab-attributes").click();
  await onScreen(page.locator("#attr-name"), page.locator("#attr-type"));
  await page.locator("#tab-entries").click();
  await noSidewaysScroll(page);

  await page.goto("/my-games");
  await expect(page.locator("#mine-loading")).toBeHidden();
  await onScreen(page.locator("#mine > *").first());
  await noSidewaysScroll(page);
});
