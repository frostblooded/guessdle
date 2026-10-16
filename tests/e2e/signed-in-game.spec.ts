import { expect, test, type Page } from "@playwright/test";
import { GUESS_DATA } from "../../src/game/roster.ts";
import { findAnswerName, submitGuess } from "./helpers.ts";

// Each test is its own player, so stored games never collide
let counter = 0;
const newEmail = (): string => `p${Date.now()}-${counter++}@example.test`;
const stubLogin = (page: Page, email: string): Promise<unknown> =>
  page.request.post("/api/test/login", { data: { email } });
const wrongNames = (answer: string): string[] =>
  GUESS_DATA.filter((pet) => pet.name !== answer).map((pet) => pet.name);

test("a signed-in guess survives a reload and shows on another device", async ({
  page,
  browser,
  request,
}) => {
  const answer = await findAnswerName(request);
  const [wrong] = wrongNames(answer);
  const email = newEmail();
  await stubLogin(page, email);
  await page.goto("/");
  await submitGuess(page, wrong!);
  await expect(page.locator(".guess-result-row")).toHaveCount(1);

  await page.reload();
  await expect(page.locator(".guess-result-row")).toHaveCount(1);

  const other = await browser.newContext({ baseURL: page.url() });
  const phone = await other.newPage();
  await stubLogin(phone, email);
  await phone.goto("/");
  await expect(phone.locator(".guess-result-row")).toHaveCount(1);
  await other.close();
});

test("the guess is stored on the server, not in the browser", async ({
  page,
  request,
}) => {
  const [wrong] = wrongNames(await findAnswerName(request));
  await stubLogin(page, newEmail());
  await page.goto("/");
  await submitGuess(page, wrong!);

  expect(await page.evaluate(() => localStorage.getItem("usedGuesses"))).toBe(
    null,
  );
  const game = await (await page.request.get("/api/game")).json();
  expect(game.ids).toHaveLength(1);
});

test("winning shows the answer, locks guessing, and reset restarts across a reload", async ({
  page,
  request,
}) => {
  const answer = await findAnswerName(request);
  await stubLogin(page, newEmail());
  await page.goto("/");
  await submitGuess(page, answer);
  await expect(page.locator("#victory-answer-name")).toHaveText(answer);
  await expect(page.locator("#reset-button")).toBeVisible();
  await expect(page.locator("#new-guess-row")).toBeHidden();

  await page.reload();
  await expect(page.locator("#victory-answer-name")).toHaveText(answer);

  await page.locator("#reset-button").click();
  await expect(page.locator(".guess-result-row")).toHaveCount(0);
  await expect(page.locator("#victory-title")).toHaveCount(0);
  await page.reload();
  await expect(page.locator(".guess-result-row")).toHaveCount(0);
  await expect(page.locator("#new-guess-row")).toBeVisible();
});

test("giving up is stored: the answer shows after a reload, reset clears it", async ({
  page,
  request,
}) => {
  const answer = await findAnswerName(request);
  await stubLogin(page, newEmail());
  await page.goto("/");
  await page.locator("#give-up-button").click();
  await expect(page.locator("#give-up-answer-name")).toHaveText(answer);

  await page.reload();
  await expect(page.locator("#give-up-answer-name")).toHaveText(answer);
  await expect(page.locator("#reset-button")).toBeVisible();

  await page.locator("#reset-button").click();
  await expect(page.locator("#give-up-title")).toHaveCount(0);
  await page.reload();
  await expect(page.locator("#give-up-title")).toHaveCount(0);
  await expect(page.locator("#give-up-button")).toBeVisible();
});

test("a signed-in player's game does not leak to a signed-out visitor", async ({
  page,
  request,
}) => {
  const [wrong] = wrongNames(await findAnswerName(request));
  await stubLogin(page, newEmail());
  await page.goto("/");
  await submitGuess(page, wrong!);
  await page.locator("#logout-button").click();
  await expect(page.locator(".guess-result-row")).toHaveCount(0);

  await page.reload();
  await expect(page.locator(".guess-result-row")).toHaveCount(0);
});

test("anonymous guesses are adopted into the account on login", async ({
  page,
  request,
}) => {
  const [one, two] = wrongNames(await findAnswerName(request));
  await page.goto("/");
  await submitGuess(page, one!);
  await submitGuess(page, two!);
  await expect(page.locator(".guess-result-row")).toHaveCount(2);

  await stubLogin(page, newEmail());
  await page.reload();
  await expect(page.locator(".guess-result-row")).toHaveCount(2);
  expect(await page.evaluate(() => localStorage.getItem("usedGuesses"))).toBe(
    null,
  );
  const game = await (await page.request.get("/api/game")).json();
  expect(game.ids).toHaveLength(2);
});

test("an account with progress keeps it and discards leftover local guesses", async ({
  page,
  browser,
  request,
}) => {
  const [one, two, three] = wrongNames(await findAnswerName(request));
  const email = newEmail();
  await stubLogin(page, email);
  await page.goto("/");
  await submitGuess(page, one!);

  // Another browser: anonymous guesses, then signs in to the same account
  const other = await browser.newContext({ baseURL: page.url() });
  const phone = await other.newPage();
  await phone.goto("/");
  await submitGuess(phone, two!);
  await submitGuess(phone, three!);
  await stubLogin(phone, email);
  await phone.reload();
  await expect(phone.locator(".guess-result-row")).toHaveCount(1);
  expect(await phone.evaluate(() => localStorage.getItem("usedGuesses"))).toBe(
    null,
  );
  const game = await (await phone.request.get("/api/game")).json();
  expect(game.ids).toHaveLength(1);
  await other.close();
});

test("an anonymous give-up is adopted on login", async ({ page, request }) => {
  const answer = await findAnswerName(request);
  await page.goto("/");
  await page.locator("#give-up-button").click();
  await expect(page.locator("#give-up-answer-name")).toHaveText(answer);

  await stubLogin(page, newEmail());
  await page.reload();
  await expect(page.locator("#give-up-answer-name")).toHaveText(answer);
  const game = await (await page.request.get("/api/game")).json();
  expect(game.gaveUp).toBe(true);
});
