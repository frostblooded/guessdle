import { expect, test, type Page } from "@playwright/test";
import sharp from "sharp";

let counter = 0;
const unique = (): string =>
  `${Date.now().toString(36)}${counter++}${Math.random().toString(36).slice(2, 6)}`;

// A plain image big enough for its zoomed parts
const picture = (background: string): Promise<Buffer> =>
  sharp({ create: { width: 600, height: 400, channels: 3, background } })
    .png()
    .toBuffer();

// Adds an entry through the editor: name, image, the default parts
async function addEntry(page: Page, name: string, color: string) {
  await page.locator("#entry-name").fill(name);
  await page.locator("#entry-photo").setInputFiles({
    name: `${name}.png`,
    mimeType: "image/png",
    buffer: await picture(color),
  });
  await expect(page.locator(".zoom-box")).toHaveCount(2);
  await page.locator("#entry-submit").click();
  await expect(page.locator("#entry-list li", { hasText: name })).toBeVisible();
}

test("a Zoom game is made in the editor and played part by part", async ({
  page,
}) => {
  await page.request.post("/api/test/login", {
    data: { email: `zoom-${unique()}@example.test` },
  });
  await page.goto("/create");
  const name = `Zoom ${unique()}`;
  await page.locator("#game-name").fill(name);
  await page.locator("#game-kind-zoom").check();
  await page.locator("#create-button").click();
  await expect(page).toHaveURL(/\/edit$/);
  const slug = new URL(page.url()).pathname.split("/")[2]!;

  // No attributes; the part count is a Details field
  await expect(page.locator("#tab-attributes")).toHaveCount(0);
  await page.locator("#edit-zoom-parts").selectOption("2");
  await page.locator("#save-button").click();
  await expect(page.locator("#edit-saved")).toHaveText("Saved.");

  await page.locator("#tab-entries").click();
  await addEntry(page, "Red", "#c00");
  await addEntry(page, "Green", "#0a0");
  await addEntry(page, "Blue", "#00c");
  await expect(page.locator(".entry-missing")).toHaveCount(0);

  // Moving part 1 moves its box
  const box = page.locator('.zoom-box[data-part="1"]');
  await page
    .locator("#entry-list li", { hasText: "Red" })
    .getByRole("button", { name: "Edit Red" })
    .click();
  const before = await box.boundingBox();
  await page.mouse.move(before!.x + 5, before!.y + 5);
  await page.mouse.down();
  await page.mouse.move(before!.x + 25, before!.y + 15, { steps: 3 });
  await page.mouse.up();
  const after = await box.boundingBox();
  expect(Math.round(after!.x - before!.x)).toBeGreaterThan(10);
  await page.locator("#entry-submit").click();

  // The answer, from the stateless give-up (it leaves the owner's own game alone)
  const answer = (await (
    await page.request.post(`/api/games/${slug}/give-up`, { data: {} })
  ).json()) as { answer: string };
  expect(answer).toHaveProperty("answer");
  const wrong = ["Red", "Green", "Blue"].filter((n) => n !== answer.answer);

  await page.goto(`/g/${slug}`);
  await expect(page.locator("#zoom-view")).toBeVisible();
  await expect(page.locator("#zoom-tries")).toHaveText(
    "Part 1 of 2 · 2 tries left",
  );
  await expect
    .poll(() =>
      page
        .locator("#zoom-current")
        .evaluate((img: HTMLImageElement) => img.naturalWidth),
    )
    .toBe(640);
  // Names only in the guess list: no entry's photo is on the page
  await page.locator("#new-guess-input").fill(wrong[0]!);
  await page.locator("#submit-new-guess-button").click();
  await expect(page.locator("#zoom-tries")).toHaveText(
    "Part 2 of 2 · 1 try left",
  );
  await expect(page.locator("#zoom-thumb-1")).toBeVisible();
  await expect(page.locator(".guess-result-cell.incorrect")).toHaveText([
    wrong[0]!,
  ]);

  await page.locator("#new-guess-input").fill(wrong[1]!);
  await page.locator("#submit-new-guess-button").click();
  await expect(page.locator("#give-up-title")).toContainText("Out of tries");
  await expect(page.locator("#give-up-answer-name")).toHaveText(answer.answer);
  await expect(page.locator("#zoom-thumb-whole")).toBeVisible();
  await expect(page.locator("#new-guess-row")).toBeHidden();

  // A reload keeps the lost day
  await page.reload();
  await expect(page.locator("#give-up-title")).toContainText("Out of tries");
});

// A signed-in owner's draft Zoom game made over the API, with 5 parts per entry; returns its slug
async function apiGame(page: Page, who: string): Promise<string> {
  await page.request.post("/api/test/login", {
    data: { email: `${who}-${unique()}@example.test` },
  });
  const created = await page.request.post("/api/games", {
    data: { name: "Phone zoom", kind: "zoom" },
  });
  const { slug } = (await created.json()) as { slug: string };
  for (const [entry, color] of [
    ["One", "#c00"],
    ["Two", "#0a0"],
  ] as const) {
    const up = await page.request.post("/api/uploads?kind=zoom", {
      headers: { "Content-Type": "application/octet-stream" },
      data: await picture(color),
    });
    const { url } = (await up.json()) as { url: string };
    await page.request.post(`/api/games/${slug}/entries`, {
      data: {
        name: entry,
        photo: url,
        parts: Array.from({ length: 5 }, (_, i) => ({
          x: 0,
          y: 0,
          size: 40 + 40 * i,
        })),
      },
    });
  }
  return slug;
}

test("a Zoom game's Play page fits a phone", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 740 });
  const slug = await apiGame(page, "zoom-phone");
  await page.goto(`/g/${slug}`);
  await expect(page.locator("#zoom-view")).toBeVisible();
  const width = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(width).toBeLessThanOrEqual(375);
});

test("a party round on a Zoom game shows the round's parts", async ({
  page,
}) => {
  const slug = await apiGame(page, "zoom-party");
  await page.goto(`/party?host=${slug}`);
  await page.locator("#host-nickname").fill("Ana");
  await page.locator("#host-button").click();
  await expect(page).toHaveURL(/\/party\/[A-Z]{4}$/);
  await page.locator("#start-round").click();
  await expect(page.locator("#zoom-tries")).toHaveText(
    "Part 1 of 5 · 5 tries left",
  );
  await expect
    .poll(() =>
      page
        .locator("#zoom-current")
        .evaluate((img: HTMLImageElement) => img.naturalWidth),
    )
    .toBe(640);
  // Two entries: one guess or two finds it, and a lone player's round then ends
  await page.locator("#new-guess-input").fill("One");
  await page.locator("#submit-new-guess-button").click();
  const over = page.getByText("Round 1 is over");
  await expect(over.or(page.locator("#zoom-thumb-1"))).toBeVisible();
  if (!(await over.isVisible())) {
    await expect(page.locator("#zoom-tries")).toHaveText(
      "Part 2 of 5 · 4 tries left",
    );
    await page.locator("#new-guess-input").fill("Two");
    await page.locator("#submit-new-guess-button").click();
  }
  await expect(over).toBeVisible();
  await expect(page.locator(".party-result")).toContainText("1st");
});
