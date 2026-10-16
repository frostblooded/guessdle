import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { GUESS_DATA } from "../../roster.ts";

interface Golden {
  answers: number[];
}

const GOLDEN: Golden = JSON.parse(
  readFileSync(
    join(import.meta.dirname, "..", "fixtures", "answer-sequence.golden.json"),
    "utf8",
  ),
);

// Day Number 0 is ANSWER_START_DATE (2025-08-15), so answers[n] is the Daily Answer for that day + n.
const DAY_NUMBER = 3;
const DAY = new Date(2025, 7, 15 + DAY_NUMBER, 12);
const NEXT_DAY = new Date(2025, 7, 15 + DAY_NUMBER + 1, 12);

const names: string[] = GUESS_DATA.map((pet) => pet.name);

const input = (page: Page): Locator => page.locator("#new-guess-input");
const rows = (page: Page): Locator => page.locator(".guess-result-row");
const suggestions = (page: Page): Locator => page.locator("[role=option]");
const victory = (page: Page): Locator => page.locator("#victory-title");

async function submitGuess(page: Page, name: string): Promise<void> {
  await input(page).fill(name);
  await page.locator("#submit-new-guess-button").click();
}

async function openOnDay(page: Page, now: Date = DAY): Promise<void> {
  await page.clock.install({ time: now });
  await page.goto("/");
}

const answerName: string = names[GOLDEN.answers[DAY_NUMBER]!]!;
const nextAnswerName: string = names[GOLDEN.answers[DAY_NUMBER + 1]!]!;
const wrongName: string = names.find(
  (name) => name !== answerName && name !== nextAnswerName,
)!;

test.beforeEach(async ({ page }) => {
  await openOnDay(page);
});

test("a correct guess shows the victory banner with the answer", async ({
  page,
}) => {
  await submitGuess(page, answerName);

  await expect(victory(page)).toContainText("YOU DID IT");
  await expect(page.locator("#victory-answer-name")).toHaveText(answerName);
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page).first().locator(".cell.incorrect")).toHaveCount(0);
});

test("a wrong guess adds a row with graded cells and no victory", async ({
  page,
}) => {
  await submitGuess(page, wrongName);

  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page).first()).toContainText(wrongName);
  // Name, colors and owners cells are graded; the photo cell is not
  await expect(
    rows(page)
      .first()
      .locator(".cell.correct, .cell.partially-correct, .cell.incorrect"),
  ).toHaveCount(3);
  await expect(
    rows(page).first().locator(".cell.incorrect").first(),
  ).toBeVisible();
  await expect(victory(page)).toHaveCount(0);
});

test("a repeated guess is ignored", async ({ page }) => {
  await submitGuess(page, wrongName);
  await submitGuess(page, wrongName);

  await expect(rows(page)).toHaveCount(1);
  await expect(input(page)).toHaveValue("");
});

test("an unknown name does nothing and the list says no results", async ({
  page,
}) => {
  await input(page).fill("Nobody");

  await expect(page.locator(".no_result")).toHaveText(
    'Found No Results for "Nobody"',
  );

  await page.locator("#submit-new-guess-button").click();

  await expect(rows(page)).toHaveCount(0);
  await expect(victory(page)).toHaveCount(0);
  await expect(input(page)).toHaveValue("Nobody");
});

test("an empty name does nothing", async ({ page }) => {
  await page.locator("#submit-new-guess-button").click();
  await input(page).press("Enter");

  await expect(rows(page)).toHaveCount(0);
  await expect(victory(page)).toHaveCount(0);
});

test("name matching ignores letter case", async ({ page }) => {
  await submitGuess(page, wrongName.toUpperCase());

  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page).first()).toContainText(wrongName);
});

test("pressing Enter submits the guess", async ({ page }) => {
  await input(page).fill(wrongName);
  await input(page).press("Enter");

  await expect(rows(page)).toHaveCount(1);
});

test("used guesses are removed from the autocomplete list", async ({
  page,
}) => {
  const prefix: string = wrongName.slice(0, 2).toLowerCase();
  const matching: string[] = names.filter((name) =>
    name.toLowerCase().includes(prefix),
  );
  const remaining: number = matching.filter(
    (name) => name !== wrongName,
  ).length;

  await input(page).pressSequentially(prefix);
  await expect(suggestions(page)).toHaveCount(matching.length);

  await input(page).fill(wrongName);
  await page.locator("#submit-new-guess-button").click();
  await input(page).pressSequentially(prefix);

  await expect(suggestions(page)).toHaveCount(remaining);
  await expect(suggestions(page).filter({ hasText: wrongName })).toHaveCount(0);
});

test("guesses and victory survive a reload on the same day", async ({
  page,
}) => {
  await submitGuess(page, wrongName);
  await submitGuess(page, answerName);

  await page.reload();

  await expect(rows(page)).toHaveCount(2);
  await expect(victory(page)).toContainText(answerName);
  // Newest guess first
  await expect(rows(page).first()).toContainText(answerName);
  await expect(rows(page).last()).toContainText(wrongName);
});

test("the next day shows a fresh board with the new Daily Answer", async ({
  page,
}) => {
  await submitGuess(page, wrongName);
  await submitGuess(page, answerName);
  await expect(victory(page)).toBeVisible();

  await page.clock.setSystemTime(NEXT_DAY);
  await page.reload();

  await expect(rows(page)).toHaveCount(0);
  await expect(victory(page)).toHaveCount(0);

  await submitGuess(page, nextAnswerName);

  await expect(page.locator("#victory-answer-name")).toHaveText(nextAnswerName);
});

test.describe("before the start date", () => {
  const BEFORE_START = new Date(2025, 7, 14, 12);

  async function openWithRandom(page: Page, value: number): Promise<void> {
    await page.addInitScript(`Math.random = () => ${value};`);
    await openOnDay(page, BEFORE_START);
  }

  test("the Daily Answer falls back to a random pet", async ({ page }) => {
    await openWithRandom(page, 0);
    await submitGuess(page, names[0]!);
    await expect(page.locator("#victory-answer-name")).toHaveText(names[0]!);

    await page.evaluate("localStorage.clear()");
    await openWithRandom(page, 0.999);
    await submitGuess(page, names.at(-1)!);
    await expect(page.locator("#victory-answer-name")).toHaveText(
      names.at(-1)!,
    );
  });

  test("a wrong guess still adds a graded row", async ({ page }) => {
    await openWithRandom(page, 0);
    await submitGuess(page, names[1]!);

    await expect(rows(page)).toHaveCount(1);
    await expect(victory(page)).toHaveCount(0);
  });
});

test("help button opens and closes the how-to-play popup", async ({ page }) => {
  await openOnDay(page);
  const dialog: Locator = page.locator("#help-dialog");
  await expect(dialog).toBeHidden();
  await page.locator("#help-button").click();
  await expect(dialog).toBeVisible();
  await expect(
    dialog.locator(".correct, .partially-correct, .incorrect"),
  ).toHaveCount(6);
  await dialog.getByRole("button", { name: "CLOSE" }).click();
  await expect(dialog).toBeHidden();
});

test("help popup examples use real roster pets and fit a phone screen", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await openOnDay(page);
  await page.locator("#help-button").click();
  const dialog: Locator = page.locator("#help-dialog");

  const shown: string[] = await dialog
    .locator(".help-example .guess-result-cell:nth-child(2)")
    .allTextContents();
  for (const name of [...shown, "Eddie"]) {
    expect(names, name).toContain(name);
  }
  // The popup's green/orange/red claims must still hold for the roster data.
  const pet = (n: string) => GUESS_DATA.find((p) => p.name === n)!;
  const [ati, cookie, eddie] = [pet("Ati"), pet("Cookie"), pet("Eddie")];
  expect(cookie.colors).toEqual(ati.colors);
  expect(cookie.owners).toEqual(ati.owners);
  expect(
    ati.colors.filter((c) => eddie.colors.includes(c)).length,
  ).toBeGreaterThan(0);
  expect(ati.colors).not.toEqual(eddie.colors);
  expect(ati.owners.some((o) => eddie.owners.includes(o))).toBe(false);
  const photos: Locator = dialog.locator(".help-example img");
  await expect(photos).toHaveCount(2);
  for (const img of await photos.all()) {
    await expect(img).toBeVisible();
    expect(
      await img.evaluate((el: HTMLImageElement) => el.naturalWidth),
    ).toBeGreaterThan(0);
  }
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  const box = (await dialog.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(375);
});
