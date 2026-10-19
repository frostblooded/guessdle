import { expect, test, type Page } from "@playwright/test";
import sharp from "sharp";

let counter = 0;
const unique = (): string =>
  `${Date.now().toString(36)}${counter++}${Math.random().toString(36).slice(2, 6)}`;

// A plain image; the crop dialog makes it square
const picture = (background: string): Promise<Buffer> =>
  sharp({ create: { width: 600, height: 400, channels: 3, background } })
    .png()
    .toBuffer();

// The middle square first, then the rest row by row
const ORDER = [4, 0, 1, 2, 3, 5, 6, 7, 8];

// Adds an entry through the editor: name, a cropped image, then the squares clicked in ORDER
async function addEntry(page: Page, name: string, color: string) {
  await page.locator("#entry-new").click();
  await page.locator("#entry-name").fill(name);
  await page.locator("#entry-photo").setInputFiles({
    name: `${name}.png`,
    mimeType: "image/png",
    buffer: await picture(color),
  });
  await page.locator("#crop-confirm").click();
  await expect(page.locator("#blur-order")).toBeVisible();
  // Eight clicks: the last square goes in by itself
  for (const cell of ORDER.slice(0, 8)) {
    await page.locator(`.blur-cell[data-cell="${cell}"]`).click();
  }
  await expect(page.locator('.blur-cell[data-cell="8"]')).toHaveText("9");
  await expect(page.locator('.blur-cell[data-cell="4"]')).toHaveText("1");
  await page.locator("#entry-submit").click();
  await expect(page.locator("#entry-list li", { hasText: name })).toBeVisible();
}

test("a Blur game is made in the editor and played square by square", async ({
  page,
}) => {
  await page.request.post("/api/test/login", {
    data: { email: `blur-${unique()}@example.test` },
  });
  await page.goto("/create");
  const name = `Blur ${unique()}`;
  await page.locator("#game-name").fill(name);
  await page.locator("#game-kind-blur").check();
  await page.locator("#create-button").click();
  await expect(page).toHaveURL(/\/edit$/);
  const slug = new URL(page.url()).pathname.split("/")[2]!;

  // No attributes; the tries are a Details field
  await expect(page.locator("#tab-attributes")).toHaveCount(0);
  await page.locator("#edit-blur-tries").selectOption("3");
  await page.locator("#save-button").click();
  await expect(page.locator("#edit-saved")).toHaveText("Saved.");

  await page.locator("#tab-entries").click();
  // An unfinished order is refused before it is sent
  await page.locator("#entry-new").click();
  await page.locator("#entry-name").fill("Half");
  await page.locator("#entry-photo").setInputFiles({
    name: "half.png",
    mimeType: "image/png",
    buffer: await picture("#888"),
  });
  await page.locator("#crop-confirm").click();
  await page.locator('.blur-cell[data-cell="0"]').click();
  await page.locator("#entry-submit").click();
  await expect(
    page.getByText("pick the order of all nine squares"),
  ).toBeVisible();
  await page.locator("#blur-order-clear").click();
  await expect(page.locator('.blur-cell[data-cell="0"]')).toHaveText("");

  await page.locator("#entry-cancel").click();
  await addEntry(page, "Red", "#c00");
  await addEntry(page, "Green", "#0a0");
  await addEntry(page, "Blue", "#00c");
  await expect(page.locator(".entry-missing")).toHaveCount(0);

  // The answer, from the stateless give-up (it leaves the owner's own game alone)
  const answer = (await (
    await page.request.post(`/api/games/${slug}/give-up`, { data: {} })
  ).json()) as { answer: string };
  expect(answer).toHaveProperty("answer");
  const wrong = ["Red", "Green", "Blue"].filter((n) => n !== answer.answer);

  await page.goto(`/g/${slug}`);
  await expect(page.locator("#blur-view")).toBeVisible();
  await expect(page.locator("#blur-tries")).toHaveText(
    "1 of 9 squares clear · 3 tries left",
  );
  await expect
    .poll(() =>
      page
        .locator("#blur-current")
        .evaluate((img: HTMLImageElement) => img.naturalWidth),
    )
    .toBeGreaterThan(0);
  await page.locator("#new-guess-input").fill(wrong[0]!);
  await page.locator("#submit-new-guess-button").click();
  await expect(page.locator("#blur-tries")).toHaveText(
    "2 of 9 squares clear · 2 tries left",
  );
  await expect(page.locator(".guess-result-cell.incorrect")).toHaveText([
    wrong[0]!,
  ]);

  // A skip uses a try and clears the next square, and keeps what was typed
  await page.locator("#new-guess-input").fill(wrong[1]!);
  await page.keyboard.press("Escape");
  await page.locator("#skip-guess-button").click();
  await expect(page.locator("#blur-tries")).toHaveText(
    "3 of 9 squares clear · 1 try left",
  );
  await expect(page.locator(".guess-result-cell.skipped")).toHaveText([
    "Skipped",
  ]);
  await expect(page.locator("#new-guess-input")).toHaveValue(wrong[1]!);

  await page.locator("#new-guess-input").fill(wrong[1]!);
  await page.locator("#submit-new-guess-button").click();
  await expect(page.locator("#give-up-title")).toContainText("Out of tries");
  await expect(page.locator("#give-up-answer-name")).toHaveText(answer.answer);
  await expect(page.locator("#blur-current")).toHaveAttribute(
    "src",
    /^\/uploads\//,
  );
  await expect(page.locator("#new-guess-row")).toBeHidden();
  await expect(page.locator("#skip-guess-button")).toHaveCount(0);

  // A reload keeps the lost day
  await page.reload();
  await expect(page.locator("#give-up-title")).toContainText("Out of tries");
});

// A signed-in owner's draft Blur game made over the API, with nine tries; returns its slug
async function apiGame(page: Page, who: string): Promise<string> {
  await page.request.post("/api/test/login", {
    data: { email: `${who}-${unique()}@example.test` },
  });
  const created = await page.request.post("/api/games", {
    data: { name: "Phone blur", kind: "blur" },
  });
  const { slug } = (await created.json()) as { slug: string };
  for (const [entry, color] of [
    ["One", "#c00"],
    ["Two", "#0a0"],
  ] as const) {
    const up = await page.request.post("/api/uploads?kind=photo", {
      headers: { "Content-Type": "application/octet-stream" },
      data: await picture(color),
    });
    const { url } = (await up.json()) as { url: string };
    await page.request.post(`/api/games/${slug}/entries`, {
      data: { name: entry, photo: url, blurOrder: ORDER },
    });
  }
  return slug;
}

test("a Blur game's Play page fits a phone", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 740 });
  const slug = await apiGame(page, "blur-phone");
  await page.goto(`/g/${slug}`);
  await expect(page.locator("#blur-view")).toBeVisible();
  const width = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(width).toBeLessThanOrEqual(375);
});

test("a party round on a Blur game shows the round's board", async ({
  page,
}) => {
  const slug = await apiGame(page, "blur-party");
  await page.goto(`/party?host=${slug}`);
  await page.locator("#host-nickname").fill("Ana");
  await page.locator("#host-button").click();
  await expect(page).toHaveURL(/\/party\/[A-Z]{4}$/);
  await page.locator("#start-round").click();
  await expect(page.locator("#blur-tries")).toHaveText(
    "1 of 9 squares clear · 9 tries left",
  );
  await expect
    .poll(() =>
      page
        .locator("#blur-current")
        .evaluate((img: HTMLImageElement) => img.naturalWidth),
    )
    .toBeGreaterThan(0);
  // A skip clears the next square
  await page.locator("#skip-guess-button").click();
  await expect(page.locator("#blur-tries")).toHaveText(
    "2 of 9 squares clear · 8 tries left",
  );
  // Two entries: one guess or two finds it, and a lone player's round then ends
  await page.locator("#new-guess-input").fill("One");
  await page.locator("#submit-new-guess-button").click();
  const over = page.getByText("Round 1 is over");
  const second = page.locator("#blur-tries", {
    hasText: "3 of 9 squares clear",
  });
  await expect(over.or(second)).toBeVisible();
  if (!(await over.isVisible())) {
    await page.locator("#new-guess-input").fill("Two");
    await page.locator("#submit-new-guess-button").click();
  }
  await expect(over).toBeVisible();
  await expect(page.locator(".party-result")).toContainText("1st");
});
