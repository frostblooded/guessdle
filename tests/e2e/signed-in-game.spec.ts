import { expect, test, type Page } from "@playwright/test";
import { GUESS_DATA } from "./roster.ts";
import {
  confirmReset,
  findAnswerName,
  signOutViaMenu,
  submitGuess,
  winGame,
} from "./helpers.ts";

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
  await page.goto("/g/petdle");
  await submitGuess(page, wrong!);
  await expect(page.locator(".guess-result-row")).toHaveCount(1);

  await page.reload();
  await expect(page.locator(".guess-result-row")).toHaveCount(1);

  const other = await browser.newContext({ baseURL: page.url() });
  const phone = await other.newPage();
  await stubLogin(phone, email);
  await phone.goto("/g/petdle");
  await expect(phone.locator(".guess-result-row")).toHaveCount(1);
  await other.close();
});

test("the guess is stored on the server, not in the browser", async ({
  page,
  request,
}) => {
  const [wrong] = wrongNames(await findAnswerName(request));
  await stubLogin(page, newEmail());
  await page.goto("/g/petdle");
  await submitGuess(page, wrong!);

  expect(
    await page.evaluate(() => localStorage.getItem("game:petdle:usedGuesses")),
  ).toBe(null);
  const game = await (await page.request.get("/api/games/petdle/state")).json();
  expect(game.ids).toHaveLength(1);
});

test("winning shows the answer, locks guessing, and reset restarts across a reload", async ({
  page,
  request,
}) => {
  const answer = await findAnswerName(request);
  await stubLogin(page, newEmail());
  await page.goto("/g/petdle");
  await winGame(page, answer);
  await expect(page.locator("#victory-answer-name")).toHaveText(answer);
  await expect(page.locator("#reset-button")).toBeVisible();
  await expect(page.locator("#new-guess-row")).toBeHidden();

  await page.reload();
  await expect(page.locator("#victory-answer-name")).toHaveText(answer);

  await page.locator("#reset-button").click();
  await confirmReset(page);
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
  await page.goto("/g/petdle");
  await page.locator("#give-up-button").click();
  await expect(page.locator("#give-up-answer-name")).toHaveText(answer);

  await page.reload();
  await expect(page.locator("#give-up-answer-name")).toHaveText(answer);
  await expect(page.locator("#reset-button")).toBeVisible();

  await page.locator("#reset-button").click();
  await confirmReset(page);
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
  await page.goto("/g/petdle");
  await submitGuess(page, wrong!);
  await signOutViaMenu(page);
  await expect(page.locator(".guess-result-row")).toHaveCount(0);

  await page.reload();
  await expect(page.locator(".guess-result-row")).toHaveCount(0);
});

test("anonymous guesses are adopted into the account on login", async ({
  page,
  request,
}) => {
  const [one, two] = wrongNames(await findAnswerName(request));
  await page.goto("/g/petdle");
  await submitGuess(page, one!);
  await submitGuess(page, two!);
  await expect(page.locator(".guess-result-row")).toHaveCount(2);

  await stubLogin(page, newEmail());
  await page.reload();
  await expect(page.locator(".guess-result-row")).toHaveCount(2);
  expect(
    await page.evaluate(() => localStorage.getItem("game:petdle:usedGuesses")),
  ).toBe(null);
  const game = await (await page.request.get("/api/games/petdle/state")).json();
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
  await page.goto("/g/petdle");
  await submitGuess(page, one!);

  // Another browser: anonymous guesses, then signs in to the same account
  const other = await browser.newContext({ baseURL: page.url() });
  const phone = await other.newPage();
  await phone.goto("/g/petdle");
  await submitGuess(phone, two!);
  await submitGuess(phone, three!);
  await stubLogin(phone, email);
  await phone.reload();
  await expect(phone.locator(".guess-result-row")).toHaveCount(1);
  expect(
    await phone.evaluate(() => localStorage.getItem("game:petdle:usedGuesses")),
  ).toBe(null);
  const game = await (
    await phone.request.get("/api/games/petdle/state")
  ).json();
  expect(game.ids).toHaveLength(1);
  await other.close();
});

test("an anonymous give-up is adopted on login", async ({ page, request }) => {
  const answer = await findAnswerName(request);
  await page.goto("/g/petdle");
  await page.locator("#give-up-button").click();
  await expect(page.locator("#give-up-answer-name")).toHaveText(answer);

  await stubLogin(page, newEmail());
  await page.reload();
  await expect(page.locator("#give-up-answer-name")).toHaveText(answer);
  const game = await (await page.request.get("/api/games/petdle/state")).json();
  expect(game.gaveUp).toBe(true);
});

test("a signed-in player can reset mid-game, stored on the server", async ({
  page,
  request,
}) => {
  const [wrong] = wrongNames(await findAnswerName(request));
  await stubLogin(page, newEmail());
  await page.goto("/g/petdle");
  await submitGuess(page, wrong!);

  await page.locator("#reset-guesses-button").click();
  await confirmReset(page);
  await expect(page.locator(".guess-result-row")).toHaveCount(0);
  await expect(page.locator("#reset-guesses-button")).toBeDisabled();

  await page.reload();
  await expect(page.locator(".guess-result-row")).toHaveCount(0);
  expect(
    (await (await page.request.get("/api/games/petdle/state")).json()).ids,
  ).toEqual([]);
});

test("a guest win is dropped once the player signs in and wins", async ({
  page,
  request,
}) => {
  const answer = await findAnswerName(request);
  const [wrong] = wrongNames(answer);
  await page.goto("/g/petdle");
  await submitGuess(page, wrong!);
  await winGame(page, answer);

  await stubLogin(page, newEmail());
  await page.reload();
  await page.locator("#reset-button").click();
  await confirmReset(page);
  await submitGuess(page, answer);
  // The guest's 2-guess win is dropped: the account's 1-guess win is its first
  const dialog = page.locator("#stats-dialog");
  await expect(dialog.locator("#stats-guesses")).toHaveText("1");
  await expect(dialog.locator("#stats-replay")).toHaveCount(0);
});

test("See stats shows the time of a win played on another device", async ({
  page,
  request,
}) => {
  const answer = await findAnswerName(request);
  const [wrong] = wrongNames(answer);
  await stubLogin(page, newEmail());
  // Another device: the guesses go straight to the server
  const ids = (name: string): number =>
    GUESS_DATA.find((pet) => pet.name === name)!.id;
  for (const name of [wrong!, answer]) {
    await page.request.post("/api/games/petdle/state/guess", {
      data: { id: ids(name) },
    });
  }
  await page.goto("/g/petdle");
  await page.locator("#stats-button").click();
  const dialog = page.locator("#stats-dialog");
  await expect(dialog.locator("#stats-guesses")).toHaveText("2");
  await expect(dialog.locator("#stats-time")).toHaveText("0s");
});
