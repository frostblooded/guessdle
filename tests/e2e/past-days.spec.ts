import { expect, test, type APIRequestContext } from "@playwright/test";
import { GUESS_DATA } from "./roster.ts";
import { submitGuess } from "./helpers.ts";

let counter = 0;
const newEmail = (): string => `past${Date.now()}-${counter++}@example.test`;

// Today's Day Number, from the Past days list
async function today(request: APIRequestContext): Promise<number> {
  return (await (await request.get("/api/games/petdle/days")).json()).today;
}

// A past day's answer: guessing the whole roster makes the API reveal it
async function answerOn(
  request: APIRequestContext,
  day: number,
): Promise<string> {
  const response = await request.post(`/api/games/petdle/grade?day=${day}`, {
    data: { ids: GUESS_DATA.map((pet) => pet.id) },
  });
  return (await response.json()).answer;
}

test("an anonymous player gives up on yesterday from the Past days list", async ({
  page,
  request,
}) => {
  const yesterday = (await today(request)) - 1;
  await page.goto("/g/petdle");
  await page.locator("#past-days-link").click();
  await expect(page).toHaveURL(/\/g\/petdle\/days$/);
  await expect(page.locator("#day-list .day-row")).toHaveCount(yesterday + 2);

  await page.locator(`#day-${yesterday}`).click();
  await expect(page).toHaveURL(new RegExp(`/g/petdle/day/${yesterday}$`));
  await expect(page.locator("#game-lede")).toContainText(`Day ${yesterday}`);
  await expect(page.locator("#loading-state")).toBeHidden();
  await expect(page.locator("#reset-guesses-button")).toBeHidden();
  await page.locator("#give-up-button").click();
  await expect(page.locator("#give-up-answer-name")).toHaveText(
    await answerOn(request, yesterday),
  );
  await expect(page.locator("#reset-button")).toBeHidden();

  await page.locator("#past-days-link").click();
  await expect(page.locator(`#day-${yesterday} .day-status`)).toHaveText(
    "Gave up",
  );
  await expect(page.locator(".day-status").first()).toHaveText("Not played");
});

test("a signed-in win on a past day stays as a read-only grid", async ({
  page,
  request,
}) => {
  const day = (await today(request)) - 2;
  const answer = await answerOn(request, day);
  await page.request.post("/api/test/login", { data: { email: newEmail() } });
  await page.goto(`/g/petdle/day/${day}`);
  await submitGuess(page, answer);
  await expect(page.locator("#victory-answer-name")).toHaveText(answer);

  await page.reload();
  await expect(page.locator(".guess-result-row")).toHaveCount(1);
  await expect(page.locator("#victory-title")).toBeVisible();
  await expect(page.locator("#new-guess-row")).toBeHidden();
  await expect(page.locator("#reset-button")).toBeHidden();

  await page.goto("/g/petdle/days");
  await expect(page.locator(`#day-${day} .day-status`)).toHaveText("Won");

  await page.goto("/g/petdle");
  await expect(page.locator("#empty-state")).toBeVisible();
});

test("a day after today does not exist yet", async ({ page, request }) => {
  await page.goto(`/g/petdle/day/${(await today(request)) + 1}`);
  await expect(page.locator("#no-such-day")).toBeVisible();
});
