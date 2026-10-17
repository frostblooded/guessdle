import { expect, test, type Page, type Route } from "@playwright/test";
import { GUESS_DATA } from "./roster.ts";
import { findAnswerName, submitGuess } from "./helpers.ts";

const MESSAGE =
  "Too many requests in a short time. Wait a minute, then try again.";
// nginx answers a flood with a plain-text 429, the API with JSON
const nginx429 = (route: Route): Promise<void> =>
  route.fulfill({
    status: 429,
    contentType: "text/html",
    body: "<html>429 Too Many Requests</html>",
  });
const api429 = (route: Route): Promise<void> =>
  route.fulfill({
    status: 429,
    contentType: "application/json",
    body: JSON.stringify({ error: "rate_limited" }),
  });

let counter = 0;
const signIn = (page: Page): Promise<unknown> =>
  page.request.post("/api/test/login", {
    data: { email: `rl${Date.now()}-${counter++}@example.test` },
  });
const input = (page: Page) => page.locator("#new-guess-input");
const notice = (page: Page) => page.locator("#notice");
const rows = (page: Page) => page.locator(".guess-result-row");

let wrongName: string;
test.beforeAll(async ({ request }) => {
  const answer = await findAnswerName(request);
  wrongName = GUESS_DATA.find((pet) => pet.name !== answer)!.name;
});

for (const [kind, respond] of [
  ["plain nginx", nginx429],
  ["JSON API", api429],
] as const) {
  test(`anonymous: a ${kind} 429 shows the message and keeps the typed guess`, async ({
    page,
  }) => {
    await page.goto("/g/petdle");
    await expect(page.locator("#loading-state")).toBeHidden();
    await page.route("**/api/games/petdle/grade", respond);
    await input(page).fill(wrongName);
    await page.locator("#submit-new-guess-button").click();

    await expect(notice(page)).toHaveText(MESSAGE);
    await expect(input(page)).toHaveValue(wrongName);
    await expect(rows(page)).toHaveCount(0);

    await page.unroute("**/api/games/petdle/grade");
    await page.locator("#submit-new-guess-button").click();
    await expect(rows(page)).toHaveCount(1);
    await expect(input(page)).toHaveValue("");
    await expect(notice(page)).toBeHidden();
  });

  test(`signed in: a ${kind} 429 shows the message and keeps the typed guess`, async ({
    page,
  }) => {
    await signIn(page);
    await page.goto("/g/petdle");
    await expect(page.locator("#loading-state")).toBeHidden();
    await page.route("**/api/games/petdle/state/guess", respond);
    await input(page).fill(wrongName);
    await page.locator("#submit-new-guess-button").click();

    await expect(notice(page)).toHaveText(MESSAGE);
    await expect(input(page)).toHaveValue(wrongName);
    await expect(rows(page)).toHaveCount(0);

    await page.unroute("**/api/games/petdle/state/guess");
    await page.locator("#submit-new-guess-button").click();
    await expect(rows(page)).toHaveCount(1);
    await expect(notice(page)).toBeHidden();
  });

  test(`a ${kind} 429 on give up shows the message and the game goes on`, async ({
    page,
  }) => {
    await page.goto("/g/petdle");
    // The buttons work once the game has loaded
    await expect(page.locator("#loading-state")).toBeHidden();
    await page.route("**/api/games/petdle/give-up", respond);
    await page.locator("#give-up-button").click();

    await expect(notice(page)).toHaveText(MESSAGE);
    await expect(page.locator("#give-up-title")).toHaveCount(0);
    await expect(input(page)).toBeVisible();
  });
}

test("merge: a 429 on sign-in shows the message and keeps the local guess", async ({
  page,
}) => {
  await page.goto("/g/petdle");
  await submitGuess(page, wrongName);
  await signIn(page);
  await page.route("**/api/games/petdle/state/merge", nginx429);
  await page.reload();

  await expect(notice(page)).toHaveText(MESSAGE);
  expect(
    await page.evaluate(() => localStorage.getItem("game:petdle:usedGuesses")),
  ).not.toBeNull();
});
