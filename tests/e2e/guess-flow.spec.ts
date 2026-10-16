import { expect, test, type Locator, type Page } from "@playwright/test";
import { GUESS_DATA } from "../../src/game/roster.ts";
import { findAnswerName, submitGuess } from "./helpers.ts";

// The browser's own (fake) clock; the server decides the Daily Answer's day
const DAY = new Date(2025, 7, 18, 12);
const NEXT_DAY = new Date(2025, 7, 19, 12);
const LOCAL_TODAY = "2025-8-18";

const names: string[] = GUESS_DATA.map((pet) => pet.name);

const input = (page: Page): Locator => page.locator("#new-guess-input");
const rows = (page: Page): Locator => page.locator(".guess-result-row");
const suggestions = (page: Page): Locator => page.locator("[role=option]");
const victory = (page: Page): Locator => page.locator("#victory-title");

async function openOnDay(page: Page, now: Date = DAY): Promise<void> {
  await page.clock.install({ time: now });
  await page.goto("/");
}

let answerName: string;
let wrongName: string;
let wrongId: string;

test.beforeEach(async ({ page, request }) => {
  answerName = await findAnswerName(request);
  wrongName = names.find((name) => name !== answerName)!;
  wrongId = GUESS_DATA.find((pet) => pet.name === wrongName)!.id;
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
  await expect(rows(page)).toHaveCount(1);
  await input(page).pressSequentially(prefix);

  await expect(suggestions(page)).toHaveCount(remaining);
  await expect(
    suggestions(page).filter({ hasText: new RegExp(`^${wrongName}$`) }),
  ).toHaveCount(0);
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

test("the next day shows a fresh board", async ({ page }) => {
  await submitGuess(page, wrongName);
  await submitGuess(page, answerName);
  await expect(victory(page)).toBeVisible();

  await page.clock.setSystemTime(NEXT_DAY);
  await page.reload();

  await expect(rows(page)).toHaveCount(0);
  await expect(victory(page)).toHaveCount(0);

  await submitGuess(page, answerName);

  await expect(page.locator("#victory-answer-name")).toHaveText(answerName);
});

test("a failed request keeps the typed guess and adds no row", async ({
  page,
}) => {
  await page.route("**/api/grade", (route) => route.abort());
  await input(page).fill(wrongName);
  await page.locator("#submit-new-guess-button").click();

  await expect(rows(page)).toHaveCount(0);
  await expect(input(page)).toHaveValue(wrongName);

  await page.unroute("**/api/grade");
  await page.locator("#submit-new-guess-button").click();
  await expect(rows(page)).toHaveCount(1);
  await expect(input(page)).toHaveValue("");
});

test("a server error response keeps the typed guess too", async ({ page }) => {
  await page.route("**/api/grade", (route) =>
    route.fulfill({
      status: 429,
      contentType: "application/json",
      body: JSON.stringify({ error: "rate_limited" }),
    }),
  );
  await input(page).fill(wrongName);
  await page.locator("#submit-new-guess-button").click();

  await expect(rows(page)).toHaveCount(0);
  await expect(input(page)).toHaveValue(wrongName);
});

test.describe("upgrading state stored by an older version", () => {
  const seed = async (
    page: Page,
    items: Record<string, string>,
  ): Promise<void> => {
    await page.addInitScript((entries) => {
      if (!localStorage.getItem("seeded")) {
        for (const [key, value] of Object.entries(entries)) {
          localStorage.setItem(key, value);
        }
        localStorage.setItem("seeded", "1");
      }
    }, items);
  };

  test("today's guesses stored by name are graded and kept as ids", async ({
    page,
  }) => {
    await seed(page, {
      lastPlayed: JSON.stringify(LOCAL_TODAY),
      usedGuesses: JSON.stringify([wrongName, "Gone Pet"]),
    });
    await page.reload();

    await expect(rows(page)).toHaveCount(1);
    await expect(rows(page).first()).toContainText(wrongName);
    expect(await page.evaluate(() => localStorage.getItem("usedGuesses"))).toBe(
      JSON.stringify([wrongId]),
    );
  });

  test("a stored victory is re-derived from the guesses", async ({ page }) => {
    await seed(page, {
      lastPlayed: JSON.stringify(LOCAL_TODAY),
      usedGuesses: JSON.stringify([wrongName, answerName]),
      victory: "true",
    });
    await page.reload();

    await expect(rows(page)).toHaveCount(2);
    await expect(page.locator("#victory-answer-name")).toHaveText(answerName);
  });

  test("another day's guesses are cleared", async ({ page }) => {
    await seed(page, {
      lastPlayed: JSON.stringify("2025-8-17"),
      usedGuesses: JSON.stringify([wrongName]),
    });
    await page.reload();

    await expect(rows(page)).toHaveCount(0);
  });

  test("guesses graded on an earlier server day are cleared", async ({
    page,
  }) => {
    await seed(page, {
      lastPlayed: JSON.stringify(LOCAL_TODAY),
      usedGuesses: JSON.stringify([wrongId]),
      day: "3",
    });
    await page.reload();

    await expect(rows(page)).toHaveCount(0);
    await submitGuess(page, wrongName);
    await expect(rows(page)).toHaveCount(1);
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
  ).toHaveCount(12);
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
  for (const name of [...shown, "Ati"]) {
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
  await expect(photos).toHaveCount(4);
  // Step through the guide: each step fits and shows its photo.
  const next: Locator = page.locator("#help-next");
  const stepCount: number = await dialog.locator(".help-step").count();
  expect(stepCount).toBe(5);
  for (let i = 0; i < stepCount; i++) {
    await expect(dialog.locator(".help-step:not([hidden])")).toHaveCount(1);
    for (const img of await dialog
      .locator(".help-step:not([hidden]) img")
      .all()) {
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
    if (i < stepCount - 1) {
      await next.click();
    }
  }
  await expect(next).toBeDisabled();
  await page.locator("#help-prev").click();
  await expect(next).toBeEnabled();
});

test("help popup restarts at step 1 on reopen", async ({ page }) => {
  await openOnDay(page);
  const dialog: Locator = page.locator("#help-dialog");
  await page.locator("#help-button").click();
  await page.locator("#help-next").click();
  await expect(page.locator("#help-count")).toHaveText("2 / 5");
  await dialog.getByRole("button", { name: "CLOSE" }).click();
  await page.locator("#help-button").click();
  await expect(page.locator("#help-count")).toHaveText("1 / 5");
  await expect(page.locator("#help-prev")).toBeDisabled();
});

const giveUpButton = (page: Page): Locator => page.locator("#give-up-button");
const resetButton = (page: Page): Locator => page.locator("#reset-button");
const giveUpTitle = (page: Page): Locator => page.locator("#give-up-title");

// Makes the server look like it moved to the next day (a tab left open past midnight)
async function serverMovesToNextDay(page: Page, url: string): Promise<void> {
  await page.route(url, async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    await route.fulfill({
      response,
      json: { ...body, day: body.day + 1 },
    });
  });
}

test.describe("give up", () => {
  test("reveals the answer, ends the game and offers a reset", async ({
    page,
  }) => {
    await expect(resetButton(page)).toBeHidden();
    await submitGuess(page, wrongName);
    await giveUpButton(page).click();

    await expect(page.locator("#give-up-answer-name")).toHaveText(answerName);
    await expect(victory(page)).toHaveCount(0);
    await expect(rows(page)).toHaveCount(1);
    await expect(input(page)).toBeHidden();
    await expect(giveUpButton(page)).toBeHidden();
    await expect(resetButton(page)).toBeVisible();
  });

  test("works before any guess", async ({ page }) => {
    await giveUpButton(page).click();

    await expect(page.locator("#give-up-answer-name")).toHaveText(answerName);
    await expect(rows(page)).toHaveCount(0);
  });

  test("survives a reload with the answer and the guesses", async ({
    page,
  }) => {
    await submitGuess(page, wrongName);
    await giveUpButton(page).click();
    await expect(giveUpTitle(page)).toBeVisible();

    await page.reload();

    await expect(page.locator("#give-up-answer-name")).toHaveText(answerName);
    await expect(rows(page)).toHaveCount(1);
    await expect(input(page)).toBeHidden();
    await expect(resetButton(page)).toBeVisible();
  });

  test("a failed request changes nothing", async ({ page }) => {
    await page.route("**/api/give-up", (route) => route.abort());
    await giveUpButton(page).click();

    await expect(giveUpTitle(page)).toHaveCount(0);
    await expect(input(page)).toBeVisible();
    await expect(resetButton(page)).toBeHidden();

    await page.unroute("**/api/give-up");
    await giveUpButton(page).click();
    await expect(giveUpTitle(page)).toBeVisible();
  });

  test("a rate limited request shows nothing and can be retried", async ({
    page,
  }) => {
    await page.route("**/api/give-up", (route) =>
      route.fulfill({
        status: 429,
        contentType: "application/json",
        body: JSON.stringify({ error: "rate_limited" }),
      }),
    );
    await giveUpButton(page).click();

    await expect(giveUpTitle(page)).toHaveCount(0);
    await expect(giveUpButton(page)).toBeVisible();
  });

  test("is not offered after a win", async ({ page }) => {
    await submitGuess(page, answerName);

    await expect(giveUpButton(page)).toBeHidden();
    await expect(giveUpTitle(page)).toHaveCount(0);
  });

  test("the next day starts a fresh game", async ({ page }) => {
    await giveUpButton(page).click();
    await expect(giveUpTitle(page)).toBeVisible();

    await page.clock.setSystemTime(NEXT_DAY);
    await page.reload();

    await expect(giveUpTitle(page)).toHaveCount(0);
    await expect(input(page)).toBeVisible();
    await expect(resetButton(page)).toBeHidden();
  });
});

test.describe("reset", () => {
  test("after a win clears the board and allows replay", async ({ page }) => {
    await submitGuess(page, wrongName);
    await submitGuess(page, answerName);
    await expect(resetButton(page)).toBeVisible();
    await expect(input(page)).toBeHidden();

    await resetButton(page).click();

    await expect(rows(page)).toHaveCount(0);
    await expect(victory(page)).toHaveCount(0);
    await expect(resetButton(page)).toBeHidden();
    await expect(input(page)).toBeVisible();
    await expect(giveUpButton(page)).toBeVisible();

    await submitGuess(page, wrongName);
    await expect(rows(page)).toHaveCount(1);
    await submitGuess(page, answerName);
    await expect(victory(page)).toContainText(answerName);
  });

  test("after a give-up clears the board and allows replay", async ({
    page,
  }) => {
    await submitGuess(page, wrongName);
    await giveUpButton(page).click();
    await resetButton(page).click();

    await expect(giveUpTitle(page)).toHaveCount(0);
    await expect(rows(page)).toHaveCount(0);
    await expect(input(page)).toBeVisible();

    await submitGuess(page, answerName);
    await expect(victory(page)).toContainText(answerName);
  });

  test("holds after a reload", async ({ page }) => {
    await submitGuess(page, answerName);
    await resetButton(page).click();

    await page.reload();

    await expect(rows(page)).toHaveCount(0);
    await expect(victory(page)).toHaveCount(0);
    await expect(input(page)).toBeVisible();
    await expect(resetButton(page)).toBeHidden();
    expect(
      await page.evaluate(() => localStorage.getItem("usedGuesses")),
    ).toBeNull();
  });

  test("makes used pets guessable again", async ({ page }) => {
    await submitGuess(page, wrongName);
    await giveUpButton(page).click();
    await resetButton(page).click();

    await submitGuess(page, wrongName);
    await expect(rows(page)).toHaveCount(1);
  });
});

test.describe("day rollover in an open tab", () => {
  test("a guess after midnight clears the old board and starts the new day", async ({
    page,
  }) => {
    await submitGuess(page, wrongName);
    await expect(rows(page)).toHaveCount(1);

    await serverMovesToNextDay(page, "**/api/grade");
    await submitGuess(page, wrongName);

    // Only the new day's guess is shown
    await expect(rows(page)).toHaveCount(1);
    await expect(victory(page)).toHaveCount(0);
  });

  test("a reload on a later server day clears a won game", async ({ page }) => {
    await submitGuess(page, answerName);
    await expect(victory(page)).toBeVisible();

    await serverMovesToNextDay(page, "**/api/grade");
    await page.reload();

    await expect(victory(page)).toHaveCount(0);
    await expect(rows(page)).toHaveCount(0);
    await expect(input(page)).toBeVisible();
    await expect(resetButton(page)).toBeHidden();
  });

  test("giving up in a stale tab starts the new day instead of revealing", async ({
    page,
  }) => {
    await submitGuess(page, wrongName);
    await serverMovesToNextDay(page, "**/api/give-up");

    await giveUpButton(page).click();

    await expect(giveUpTitle(page)).toHaveCount(0);
    await expect(rows(page)).toHaveCount(0);
    await expect(input(page)).toBeVisible();
    await expect(giveUpButton(page)).toBeVisible();
  });

  test("a reload on a later server day clears a finished game", async ({
    page,
  }) => {
    await giveUpButton(page).click();
    await expect(giveUpTitle(page)).toBeVisible();

    await serverMovesToNextDay(page, "**/api/give-up");
    await page.reload();

    await expect(giveUpTitle(page)).toHaveCount(0);
    await expect(input(page)).toBeVisible();
    await expect(resetButton(page)).toBeHidden();
  });
});
