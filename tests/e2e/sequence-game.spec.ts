import { expect, test, type Page } from "@playwright/test";
import sharp from "sharp";

let counter = 0;
const unique = (): string =>
  `${Date.now().toString(36)}${counter++}${Math.random().toString(36).slice(2, 6)}`;

// A plain image; the crop dialog makes it 16:9
const picture = (background: string): Promise<Buffer> =>
  sharp({ create: { width: 800, height: 600, channels: 3, background } })
    .png()
    .toBuffer();

// Adds an entry through the editor: its name and `colors.length` cropped photos
async function addEntry(page: Page, name: string, colors: string[]) {
  await page.locator("#entry-name").fill(name);
  for (const [slot, color] of colors.entries()) {
    await page
      .locator(`#shots [data-slot="${slot}"] input[type=file]`)
      .setInputFiles({
        name: `${name}-${slot}.png`,
        mimeType: "image/png",
        buffer: await picture(color),
      });
    await page.locator("#crop-confirm").click();
    await expect(
      page.locator(`#shots [data-slot="${slot}"] img`),
    ).toBeVisible();
  }
  await page.locator("#entry-submit").click();
  await expect(page.locator("#entry-list li", { hasText: name })).toBeVisible();
}

test("a Sequence game is made in the editor and played photo by photo, with a skip", async ({
  page,
}) => {
  await page.request.post("/api/test/login", {
    data: { email: `seq-${unique()}@example.test` },
  });
  await page.goto("/create");
  await page.locator("#game-name").fill(`Sequence ${unique()}`);
  await page.locator("#game-kind-sequence").check();
  await page.locator("#create-button").click();
  await expect(page).toHaveURL(/\/edit$/);
  const slug = new URL(page.url()).pathname.split("/")[2]!;

  await expect(page.locator("#tab-attributes")).toHaveCount(0);
  await expect(page.locator("#edit-blur-tries")).toHaveValue("6");
  await page.locator("#edit-blur-tries").selectOption("2");
  await page.locator("#save-button").click();
  await expect(page.locator("#edit-saved")).toHaveText("Saved.");

  await page.locator("#tab-entries").click();
  await addEntry(page, "Red", ["#c00", "#900"]);
  await addEntry(page, "Green", ["#0a0", "#070"]);
  // One photo short: guess only
  await addEntry(page, "Half", ["#888"]);
  await expect(page.locator(".entry-missing")).toHaveText([
    "Missing photos: guess only",
  ]);

  // Red is the oldest complete entry, so it is today's answer
  await page.goto(`/g/${slug}`);
  await expect(page.locator("#sequence-view")).toBeVisible();
  await expect(page.locator("#sequence-tries")).toHaveText(
    "Photo 1 of 2 · 2 tries left",
  );
  await expect
    .poll(() =>
      page
        .locator("#sequence-current")
        .evaluate((img: HTMLImageElement) => img.naturalWidth),
    )
    .toBeGreaterThan(0);
  await page.locator("#skip-button").click();
  await expect(page.locator("#sequence-tries")).toHaveText(
    "Photo 2 of 2 · 1 try left",
  );
  await expect(page.locator(".guess-result-cell.incorrect")).toHaveText([
    "Skipped",
  ]);
  await page.locator('[data-shot="1"]').click();
  await expect(page.locator("#sequence-current")).toHaveAttribute(
    "alt",
    "Photo 1 of 2",
  );

  await page.locator("#new-guess-input").fill("Half");
  await page.locator("#submit-new-guess-button").click();
  await expect(page.locator("#give-up-title")).toContainText("Out of tries");
  await expect(page.locator("#give-up-answer-name")).toHaveText("Red");
  await page.reload();
  await expect(page.locator("#give-up-title")).toContainText("Out of tries");
});

test("a Sequence game's Play page fits a phone", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 740 });
  await page.request.post("/api/test/login", {
    data: { email: `seq-phone-${unique()}@example.test` },
  });
  const created = await page.request.post("/api/games", {
    data: { name: "Phone sequence", kind: "sequence" },
  });
  const { slug } = (await created.json()) as { slug: string };
  await page.request.patch(`/api/games/${slug}`, { data: { blurTries: 1 } });
  for (const [entry, color] of [
    ["One", "#c00"],
    ["Two", "#0a0"],
  ] as const) {
    const up = await page.request.post("/api/uploads?kind=shot", {
      headers: { "Content-Type": "application/octet-stream" },
      data: await picture(color),
    });
    const { url } = (await up.json()) as { url: string };
    await page.request.post(`/api/games/${slug}/entries`, {
      data: { name: entry, shots: [url] },
    });
  }
  await page.goto(`/g/${slug}`);
  await expect(page.locator("#sequence-view")).toBeVisible();
  await expect(page.locator("#skip-button")).toBeVisible();
  const width = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(width).toBeLessThanOrEqual(375);
});
