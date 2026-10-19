import { expect, test } from "@playwright/test";
import { findAnswerName, submitGuess, winGame } from "./helpers.ts";

let counter = 0;
// Lowercase base36, so it is a valid username too
const unique = (): string =>
  `f${Date.now().toString(36)}${counter++}${Math.random().toString(36).slice(2, 5)}`;

test("a player adds a friend by username, the friend accepts, and each sees the other's result", async ({
  page,
  browser,
  baseURL,
  request,
}) => {
  const ann = unique();
  const bob = unique();
  await page.request.post("/api/test/login", {
    data: { email: `${ann}@example.test` },
  });
  const other = await browser.newContext({ baseURL: baseURL! });
  const phone = await other.newPage();
  await phone.request.post("/api/test/login", {
    data: { email: `${bob}@example.test` },
  });
  await phone.request.put("/api/me/username", { data: { username: bob } });

  await page.goto("/friends");
  await page.locator("#friend-query").fill(`${bob}x`);
  await page.locator("#friend-send").click();
  await expect(page.locator("#friend-message")).toContainText(
    "No player has that username or email",
  );
  await page.locator("#friend-query").fill(bob.toUpperCase());
  await page.locator("#friend-send").click();
  await expect(page.locator("#friend-message")).toContainText("Request sent");
  await expect(page.locator("#outgoing-list")).toContainText(bob);

  // Bob sees the request from any page and accepts it
  await phone.goto("/");
  await phone.locator("#user-menu-button").click();
  await phone.getByRole("link", { name: "Friends (1)" }).click();
  await expect(phone).toHaveURL("/friends");
  await phone
    .locator("#incoming-list")
    .getByRole("button", { name: /^Accept/ })
    .click();
  await expect(phone.locator("#friends-list")).toContainText(
    `${ann}@example.test`,
  );
  await expect(phone.locator("#incoming-list")).toHaveCount(0);

  const answer = await findAnswerName(request);
  await phone.goto("/g/petdle");
  await winGame(phone, answer);
  await other.close();

  await page.goto("/g/petdle");
  await submitGuess(page, answer);
  const friends = page.locator("#stats-dialog #friend-results");
  await expect(friends).toContainText(bob);
  await expect(friends).toContainText("1 guess");
});
