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
    data: { email: `edit-${Date.now()}@example.test`, admin: true },
  });
  await page.goto("/g/petdle");
  await expect(page.locator("#loading-state")).toBeHidden();
  await expect(page.locator("#edit-link")).toHaveAttribute(
    "href",
    "/g/petdle/edit",
  );
});
