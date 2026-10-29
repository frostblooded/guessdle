import { expect, test } from "@playwright/test";
import { GUESS_DATA } from "./roster.ts";
import { submitGuess } from "./helpers.ts";

test("the gallery shows the original game as the full-width first card and opens it", async ({
  page,
}) => {
  await page.goto("/");
  const cards = page.locator(".game-card");
  await expect(cards.first()).toHaveClass(/game-card-featured/);
  await expect(cards.first().locator(".badge")).toHaveText("Original");
  await expect(cards.first()).toContainText(`${GUESS_DATA.length} entries`);
  await expect(page.locator("#gallery-loading")).toBeHidden();
  await cards.first().getByRole("link").click();
  await expect(page).toHaveURL(/\/g\/petdle$/);
  await submitGuess(page, GUESS_DATA[0]!.name);
  await expect(page.locator(".guess-result-row")).toHaveCount(1);
});

test("a failed gallery load says so", async ({ page }) => {
  await page.route("**/api/games", (route) => route.abort());
  await page.goto("/");
  await expect(page.locator("#gallery-error")).toBeVisible();
  await expect(page.locator("#gallery-loading")).toBeHidden();
});

test("an unknown game slug shows the not-found state with a way back", async ({
  page,
}) => {
  const response = await page.goto("/g/no-such-game");
  expect(response?.status()).toBe(404);
  await expect(page.locator("#not-found")).toBeVisible();
  await expect(page.locator("h1:visible")).toHaveText("Game not found");
  await expect(page.locator("#board")).toBeHidden();
  await page.getByRole("link", { name: "See all games" }).click();
  await expect(page).toHaveURL(/\/$/);
});

test("a game page carries its link-preview tags", async ({ page }) => {
  const response = await page.goto("/g/petdle");
  expect(response?.status()).toBe(200);
  await expect(page.locator("meta[property='og:title']")).toHaveAttribute(
    "content",
    / - Guessdle$/,
  );
  await expect(page.locator("meta[name=robots]")).toHaveCount(0);
});

test("old un-namespaced browser state is wiped, per-game keys are kept", async ({
  page,
}) => {
  await page.goto("/how-to-play");
  await page.evaluate(() => {
    localStorage.setItem("usedGuesses", "[1]");
    localStorage.setItem("lastPlayed", '"2025-01-01"');
    localStorage.setItem("game:petdle:usedGuesses", "[2]");
  });
  await page.goto("/");
  await expect(page.locator("#gallery-loading")).toBeHidden();
  expect(
    await page.evaluate(() => [
      localStorage.getItem("usedGuesses"),
      localStorage.getItem("lastPlayed"),
      localStorage.getItem("game:petdle:usedGuesses"),
    ]),
  ).toEqual([null, null, "[2]"]);
});

test("an admin gets an Edit link on the original game, a visitor does not", async ({
  page,
}) => {
  await page.goto("/g/petdle");
  await expect(page.locator("#loading-state")).toBeHidden();
  await expect(page.locator("#edit-link")).toBeHidden();

  await page.request.post("/api/test/login", {
    data: {
      email: `edit-${Date.now()}${Math.random().toString(36).slice(2, 6)}@example.test`,
      admin: true,
    },
  });
  await page.goto("/g/petdle");
  await expect(page.locator("#loading-state")).toBeHidden();
  await expect(page.locator("#edit-link")).toHaveAttribute(
    "href",
    "/g/petdle/edit",
  );
});

test("a gallery card shows the game's cover, a collage of entry photos without one, and nothing without either", async ({
  page,
}) => {
  const card = (slug: string, cover: string, photos: string[]): object => ({
    slug,
    name: slug,
    description: "",
    cover,
    photos,
    entryCount: 5,
    kind: "classic",
  });
  await page.route("**/api/games", (route) =>
    route.fulfill({
      json: [
        card("covered", "/uploads/cover.webp", []),
        card("tiled", "", [
          "/a.webp",
          "/b.webp",
          "/c.webp",
          "/d.webp",
          "/e.webp",
        ]),
        card("plain", "", []),
      ],
    }),
  );
  await page.goto("/");
  const cards = page.locator(".game-card");
  await expect(cards).toHaveCount(3);
  await expect(cards.nth(0).locator("img.game-banner")).toHaveAttribute(
    "src",
    "/uploads/cover.webp",
  );
  await expect(cards.nth(0).locator(".game-banner-collage")).toHaveCount(0);
  // Five photos make two full rows of two
  await expect(cards.nth(1).locator(".game-banner-collage img")).toHaveCount(4);
  await expect(cards.nth(2).locator(".game-banner")).toHaveCount(0);
  await expect(cards.nth(2).locator("h2")).toHaveText("plain");
});

test("the original game, which has no cover, shows a collage of its pets on the gallery and none on Play", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.locator(".game-card").first().locator(".game-banner-collage img"),
  ).toHaveCount(8);
  await page.goto("/g/petdle");
  await expect(page.locator("#loading-state")).toBeHidden();
  await expect(page.locator(".game-banner")).toHaveCount(0);
});

test("every gallery card names its game type in the footer, classic and blur alike", async ({
  page,
}) => {
  const card = (slug: string, kind: string): object => ({
    slug,
    name: slug,
    description: "",
    cover: "",
    photos: [],
    entryCount: 3,
    kind,
  });
  await page.route("**/api/games", (route) =>
    route.fulfill({
      json: [card("tabled", "classic"), card("blurry", "blur")],
    }),
  );
  await page.goto("/");
  const cards = page.locator(".game-card");
  await expect(cards).toHaveCount(2);
  await expect(cards.nth(0).locator(".fine-print")).toHaveText(
    "Classic·3 entries",
  );
  await expect(cards.nth(1).locator(".fine-print")).toHaveText(
    "Blur·3 entries",
  );
  await expect(cards.nth(1).locator(".game-kind svg")).toHaveCount(1);
  // The type lives only in the footer, not as a badge by the name
  await expect(cards.locator("h2 .badge")).toHaveCount(0);
});
