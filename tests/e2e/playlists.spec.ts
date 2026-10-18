import { expect, test } from "@playwright/test";

let counter = 0;
// Lowercase base36, so it is a valid username too
const unique = (): string =>
  `${Date.now().toString(36)}${counter++}${Math.random().toString(36).slice(2, 5)}`;

test("a player saves the original game from the gallery into a new playlist after picking a username", async ({
  page,
}) => {
  const username = `p${unique()}`;
  await page.request.post("/api/test/login", {
    data: { email: `${username}@example.test` },
  });
  await page.goto("/");
  // The original game is first in the gallery
  await page.locator(".game-card .save-button").first().click();
  const dialog = page.locator("#save-dialog");
  await expect(dialog).toBeVisible();
  await dialog.locator("#username").fill(username);
  await dialog.locator("#username-save").click();
  await expect(dialog.locator("#save-empty")).toBeVisible();

  await dialog.locator("#new-playlist-name").fill("Every morning");
  await dialog.locator("#new-playlist-create").click();
  const box = dialog.getByRole("checkbox", { name: /Every morning/ });
  await expect(box).toBeChecked();
  await box.uncheck();
  await expect(box).not.toBeChecked();
  await box.check();
  await expect(box).toBeChecked();
  await dialog.getByRole("link", { name: "See your playlists" }).click();

  await expect(page).toHaveURL(`/u/${username}`);
  await expect(page.locator("#profile-name")).toHaveText(username);
  const card = page.locator("#profile-playlists").getByRole("link", {
    name: /Every morning/,
  });
  await expect(card).toContainText("Private");
  await expect(card).toContainText("1 game");
  await card.click();
  await expect(page.locator("#playlist-name")).toHaveText("Every morning");
  await expect(page.locator("#playlist-games .game-card")).toHaveCount(1);
});

test("an owner edits a playlist, makes it public, and others then see it on the profile", async ({
  page,
  browser,
  baseURL,
}) => {
  const username = `p${unique()}`;
  await page.request.post("/api/test/login", {
    data: { email: `${username}@example.test` },
  });
  await page.request.put("/api/me/username", { data: { username } });
  await page.goto("/profile");
  await expect(page).toHaveURL(`/u/${username}`);
  await expect(page.locator("#playlists-empty")).toBeVisible();

  await page.locator("#new-playlist-button").click();
  await page.locator("#playlist-new-name").fill("Draft list");
  await page.locator("#playlist-new-public").uncheck();
  await page.locator("#playlist-new-create").click();
  await expect(page).toHaveURL(/\/p\/\d+\/edit$/);
  const id = /\/p\/(\d+)\/edit$/.exec(page.url())![1]!;

  await page.locator("#playlist-name-input").fill("Weekday games");
  await page.locator("#playlist-description-input").fill("My routine");
  await page.locator("#playlist-search").fill("petdle");
  await page.getByRole("button", { name: /^Add / }).first().click();
  await expect(page.locator("#playlist-order li")).toHaveCount(1);
  await page.locator("#playlist-public").check();
  await page.locator("#playlist-save").click();

  await expect(page).toHaveURL(`/p/${id}`);
  await expect(page.locator("#playlist-name")).toHaveText("Weekday games");
  await expect(page.locator("#playlist-description")).toHaveText("My routine");

  const visitor = await (
    await browser.newContext({ baseURL: baseURL! })
  ).newPage();
  await visitor.goto(`/u/${username}`);
  await visitor
    .locator("#profile-playlists")
    .getByRole("link", { name: /Weekday games/ })
    .click();
  await expect(visitor.locator("#playlist-games .game-card")).toHaveCount(1);
  await expect(visitor.locator("#playlist-edit-link")).toHaveCount(0);

  // Back to private: the visitor's link stops working
  await page.locator("#playlist-edit-link").click();
  await page.locator("#playlist-public").uncheck();
  await page.locator("#playlist-save").click();
  await expect(page).toHaveURL(`/p/${id}`);
  await visitor.reload();
  await expect(visitor.getByText("404: page not found")).toBeVisible();

  await page.locator("#playlist-edit-link").click();
  await page.locator("#playlist-delete").click();
  await page
    .locator("#playlist-delete-dialog")
    .getByRole("button", { name: "Delete" })
    .click();
  await expect(page).toHaveURL(`/u/${username}`);
  await expect(page.locator("#playlists-empty")).toBeVisible();
});

test("a signed-out player tapping Save on a game goes to sign in", async ({
  page,
}) => {
  await page.goto("/g/petdle");
  await page.locator(".save-button").click();
  await expect(page).toHaveURL(
    `/login?next=${encodeURIComponent("/g/petdle")}`,
  );
});
