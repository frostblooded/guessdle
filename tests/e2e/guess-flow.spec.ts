import { expect, test, type Locator, type Page } from "@playwright/test";
import { GUESS_DATA } from "./roster.ts";
import {
  confirmReset,
  findAnswerName,
  submitGuess,
  winGame,
} from "./helpers.ts";

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
  await page.goto("/g/petdle");
  // The game loads after the page does; the form works once it has
  await expect(page.locator("#loading-state")).toBeHidden();
}

let answerName: string;
let wrongName: string;
let wrongId: number;

test.beforeEach(async ({ page, request }) => {
  answerName = await findAnswerName(request);
  wrongName = names.find((name) => name !== answerName)!;
  wrongId = GUESS_DATA.find((pet) => pet.name === wrongName)!.id;
  await openOnDay(page);
});

test("a correct guess shows the victory banner with the answer", async ({
  page,
}) => {
  await winGame(page, answerName);

  await expect(victory(page)).toContainText("You did it");
  await expect(page.locator("#victory-answer-name")).toHaveText(answerName);
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page).first().locator(".cell.incorrect")).toHaveCount(0);
});

test("a win opens the stats popup; See stats brings it back after a reload", async ({
  page,
}) => {
  await submitGuess(page, wrongName);
  await submitGuess(page, answerName);
  const dialog = page.locator("#stats-dialog");
  await expect(dialog).toContainText("Congratulations!");
  await expect(dialog.locator("#stats-guesses")).toHaveText("2");
  await expect(
    dialog.locator("#stats-guess-chart [data-mine]"),
  ).toHaveAttribute("aria-label", /^2: \d+ players?, you$/);
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();

  await page.reload();
  await expect(victory(page)).toBeVisible();
  await expect(dialog).toBeHidden();
  await page.locator("#stats-button").click();
  await expect(dialog.locator("#stats-guesses")).toHaveText("2");
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

test("clicking a suggestion submits it at once", async ({ page }) => {
  await input(page).fill(wrongName);
  await suggestions(page)
    .filter({ hasText: new RegExp(`^${wrongName}$`) })
    .click();

  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page).first()).toContainText(wrongName);
  await expect(input(page)).toHaveValue("");
});

test("Enter on a highlighted suggestion submits it at once", async ({
  page,
}) => {
  await input(page).fill(wrongName);
  await input(page).press("ArrowDown");
  await input(page).press("Enter");

  await expect(rows(page)).toHaveCount(1);
  await expect(input(page)).toHaveValue("");
});

test("a picked suggestion the server could not grade stays in the box", async ({
  page,
}) => {
  await page.route("**/api/games/petdle/grade", (route) => route.abort());
  await input(page).fill(wrongName);
  await suggestions(page)
    .filter({ hasText: new RegExp(`^${wrongName}$`) })
    .click();

  // The request got no answer, so the notice blames the connection
  await expect(page.locator("#notice")).toContainText(
    "Could not reach the server",
  );
  await expect(rows(page)).toHaveCount(0);
  await expect(input(page)).toHaveValue(wrongName);
});

test.describe("on a phone", () => {
  test.use({
    hasTouch: true,
    isMobile: true,
    viewport: { width: 390, height: 844 },
  });

  test("tapping a suggestion submits it at once", async ({ page }) => {
    await input(page).fill(wrongName);
    await suggestions(page)
      .filter({ hasText: new RegExp(`^${wrongName}$`) })
      .tap();

    await expect(rows(page)).toHaveCount(1);
    await expect(input(page)).toHaveValue("");
  });

  test("Give up and Reset sit above the guess box, away from Guess", async ({
    page,
  }) => {
    const guess = (await page
      .locator("#submit-new-guess-button")
      .boundingBox())!;
    for (const id of ["#give-up-button", "#reset-guesses-button"]) {
      const box = (await page.locator(id).boundingBox())!;
      expect(box.y + box.height).toBeLessThan(guess.y);
    }
  });
});

test("Play has no description under the title", async ({ page }) => {
  await expect(page.locator(".page-head .lede")).toHaveCount(0);
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
  await winGame(page, answerName);

  await page.reload();
  await expect(page.locator("#loading-state")).toBeHidden();

  await expect(rows(page)).toHaveCount(2);
  await expect(victory(page)).toContainText(answerName);
  // Newest guess first
  await expect(rows(page).first()).toContainText(answerName);
  await expect(rows(page).last()).toContainText(wrongName);
});

test("the next day shows a fresh board", async ({ page }) => {
  await submitGuess(page, wrongName);
  await winGame(page, answerName);
  await expect(victory(page)).toBeVisible();

  await page.clock.setSystemTime(NEXT_DAY);
  await page.reload();
  await expect(page.locator("#loading-state")).toBeHidden();

  await expect(rows(page)).toHaveCount(0);
  await expect(victory(page)).toHaveCount(0);

  await winGame(page, answerName);

  await expect(page.locator("#victory-answer-name")).toHaveText(answerName);
});

test("a failed request keeps the typed guess and adds no row", async ({
  page,
}) => {
  await page.route("**/api/games/petdle/grade", (route) => route.abort());
  await input(page).fill(wrongName);
  await page.locator("#submit-new-guess-button").click();

  await expect(rows(page)).toHaveCount(0);
  await expect(input(page)).toHaveValue(wrongName);

  await page.unroute("**/api/games/petdle/grade");
  await page.locator("#submit-new-guess-button").click();
  await expect(rows(page)).toHaveCount(1);
  await expect(input(page)).toHaveValue("");
});

test("a server error response keeps the typed guess too", async ({ page }) => {
  await page.route("**/api/games/petdle/grade", (route) =>
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

test.describe("state stored in the browser", () => {
  const seed = async (
    page: Page,
    items: Record<string, string>,
  ): Promise<void> => {
    await page.addInitScript((entries) => {
      if (!localStorage.getItem("seeded")) {
        for (const [key, value] of Object.entries(entries)) {
          localStorage.setItem(`game:petdle:${key}`, value);
        }
        localStorage.setItem("seeded", "1");
      }
    }, items);
  };

  test("a stored victory is re-derived from the guesses", async ({ page }) => {
    await seed(page, {
      lastPlayed: JSON.stringify(LOCAL_TODAY),
      usedGuesses: JSON.stringify([
        wrongId,
        GUESS_DATA.find((pet) => pet.name === answerName)!.id,
      ]),
      victory: "true",
    });
    await page.reload();
    await expect(page.locator("#loading-state")).toBeHidden();

    await expect(rows(page)).toHaveCount(2);
    await expect(page.locator("#victory-answer-name")).toHaveText(answerName);
  });

  test("another day's guesses are cleared", async ({ page }) => {
    await seed(page, {
      lastPlayed: JSON.stringify("2025-8-17"),
      usedGuesses: JSON.stringify([wrongId]),
    });
    await page.reload();
    await expect(page.locator("#loading-state")).toBeHidden();

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
    await expect(page.locator("#loading-state")).toBeHidden();

    await expect(rows(page)).toHaveCount(0);
    await submitGuess(page, wrongName);
    await expect(rows(page)).toHaveCount(1);
  });
});

test("the how-to-play page is linked from the nav and plays a practice game to a win", async ({
  page,
}) => {
  await openOnDay(page);
  await page
    .getByRole("navigation", { name: "Main" })
    .getByRole("link", { name: "How to play" })
    .click();
  await expect(page).toHaveURL(/\/how-to-play$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "How to play",
  );
  const step = page.locator(".practice-step");
  await expect(step).toHaveAttribute("data-step", "secret");
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(step).toHaveAttribute("data-step", "first");
  await page.getByRole("button", { name: "Eddie", exact: true }).click();
  await expect(step).toHaveAttribute("data-step", "clues");
  await expect(page.locator(".practice-clues li").first()).toHaveText(
    "Name is red: Eddie is not the secret pet.",
  );
  await page.getByRole("button", { name: "Next guess" }).click();
  await expect(step).toHaveAttribute("data-step", "narrow");
  await expect(page.locator(".pet-option.ruled-out").first()).toBeVisible();
  await page.getByRole("button", { name: "Ati", exact: true }).click();
  await expect(step).toHaveAttribute("data-step", "won");
  await expect(page.locator(".practice-result")).toHaveText(
    "Ati was the secret pet. You got it in 2 guesses.",
  );
  await expect(rows(page)).toHaveCount(2);
  await page.getByRole("link", { name: "Start playing" }).click();
  await expect(page).toHaveURL(/\/$/);
});

test("the practice game offers every pet of the pet game and fits a phone screen", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await page.goto("/how-to-play");
  const fits = (): Promise<boolean> =>
    page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    );
  expect(await fits()).toBe(true);
  await page.getByRole("button", { name: "Next", exact: true }).click();
  expect((await page.locator(".pet-option").allTextContents()).sort()).toEqual(
    [...names].sort(),
  );
  await page.getByRole("button", { name: "Bela", exact: true }).click();
  await page.getByRole("button", { name: "Next guess" }).click();
  expect(await fits()).toBe(true);
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
    await expect(resetButton(page)).toHaveText("Reset today's game");
    // Centred in the play card once the game is over
    const card = await page.locator(".play-card").boundingBox();
    const button = await resetButton(page).boundingBox();
    expect(
      Math.abs(card!.x + card!.width / 2 - (button!.x + button!.width / 2)),
    ).toBeLessThan(2);
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
    await expect(page.locator("#loading-state")).toBeHidden();

    await expect(page.locator("#give-up-answer-name")).toHaveText(answerName);
    await expect(rows(page)).toHaveCount(1);
    await expect(input(page)).toBeHidden();
    await expect(resetButton(page)).toBeVisible();
  });

  test("a failed request changes nothing", async ({ page }) => {
    await page.route("**/api/games/petdle/give-up", (route) => route.abort());
    await giveUpButton(page).click();

    await expect(giveUpTitle(page)).toHaveCount(0);
    await expect(input(page)).toBeVisible();
    await expect(resetButton(page)).toBeHidden();

    await page.unroute("**/api/games/petdle/give-up");
    await giveUpButton(page).click();
    await expect(giveUpTitle(page)).toBeVisible();
  });

  test("a rate limited request shows nothing and can be retried", async ({
    page,
  }) => {
    await page.route("**/api/games/petdle/give-up", (route) =>
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
    await winGame(page, answerName);

    await expect(giveUpButton(page)).toBeHidden();
    await expect(giveUpTitle(page)).toHaveCount(0);
  });

  test("the next day starts a fresh game", async ({ page }) => {
    await giveUpButton(page).click();
    await expect(giveUpTitle(page)).toBeVisible();

    await page.clock.setSystemTime(NEXT_DAY);
    await page.reload();
    await expect(page.locator("#loading-state")).toBeHidden();

    await expect(giveUpTitle(page)).toHaveCount(0);
    await expect(input(page)).toBeVisible();
    await expect(resetButton(page)).toBeHidden();
  });
});

test.describe("reset", () => {
  test("after a win clears the board and allows replay", async ({ page }) => {
    await submitGuess(page, wrongName);
    await winGame(page, answerName);
    await expect(resetButton(page)).toBeVisible();
    await expect(input(page)).toBeHidden();

    await resetButton(page).click();
    await confirmReset(page);

    await expect(rows(page)).toHaveCount(0);
    await expect(victory(page)).toHaveCount(0);
    await expect(resetButton(page)).toBeHidden();
    await expect(input(page)).toBeVisible();
    await expect(giveUpButton(page)).toBeVisible();

    await submitGuess(page, wrongName);
    await expect(rows(page)).toHaveCount(1);
    await winGame(page, answerName);
    await expect(victory(page)).toContainText(answerName);
  });

  test("after a give-up clears the board and allows replay", async ({
    page,
  }) => {
    await submitGuess(page, wrongName);
    await giveUpButton(page).click();
    await resetButton(page).click();
    await confirmReset(page);

    await expect(giveUpTitle(page)).toHaveCount(0);
    await expect(rows(page)).toHaveCount(0);
    await expect(input(page)).toBeVisible();

    await winGame(page, answerName);
    await expect(victory(page)).toContainText(answerName);
  });

  test("holds after a reload", async ({ page }) => {
    await winGame(page, answerName);
    await resetButton(page).click();
    await confirmReset(page);

    await page.reload();
    await expect(page.locator("#loading-state")).toBeHidden();

    await expect(rows(page)).toHaveCount(0);
    await expect(victory(page)).toHaveCount(0);
    await expect(input(page)).toBeVisible();
    await expect(resetButton(page)).toBeHidden();
    expect(
      await page.evaluate(() =>
        localStorage.getItem("game:petdle:usedGuesses"),
      ),
    ).toBeNull();
  });

  test("makes used pets guessable again", async ({ page }) => {
    await submitGuess(page, wrongName);
    await giveUpButton(page).click();
    await resetButton(page).click();
    await confirmReset(page);

    await submitGuess(page, wrongName);
    await expect(rows(page)).toHaveCount(1);
  });
});

test.describe("mid-game reset", () => {
  const midReset = (page: Page): Locator =>
    page.locator("#reset-guesses-button");
  const dialog = (page: Page): Locator => page.locator("#reset-dialog");

  test("is visible but disabled until a guess, and again after a reset", async ({
    page,
  }) => {
    await expect(midReset(page)).toBeVisible();
    await expect(midReset(page)).toBeDisabled();
    await submitGuess(page, wrongName);
    await expect(midReset(page)).toBeEnabled();
    await midReset(page).click();
    await confirmReset(page);
    await expect(midReset(page)).toBeDisabled();
  });

  test("confirming clears the board and keeps the same answer", async ({
    page,
  }) => {
    await submitGuess(page, wrongName);
    await midReset(page).click();
    await expect(dialog(page)).toContainText("Reset today's guesses?");
    await confirmReset(page);
    await expect(rows(page)).toHaveCount(0);
    await expect(input(page)).toBeVisible();
    await winGame(page, answerName);
    await expect(victory(page)).toContainText(answerName);
  });

  test("cancelling keeps the guesses", async ({ page }) => {
    await submitGuess(page, wrongName);
    await midReset(page).click();
    await dialog(page).getByRole("button", { name: "Cancel" }).click();
    await expect(dialog(page)).toBeHidden();
    await expect(rows(page)).toHaveCount(1);
    await expect(midReset(page)).toBeFocused();
  });

  test("Escape cancels", async ({ page }) => {
    await submitGuess(page, wrongName);
    await midReset(page).click();
    await expect(dialog(page)).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog(page)).toBeHidden();
    await expect(rows(page)).toHaveCount(1);
  });

  test("works from the keyboard", async ({ page }) => {
    await submitGuess(page, wrongName);
    await midReset(page).focus();
    await page.keyboard.press("Enter");
    // Cancel has initial focus; Tab moves to Reset
    await expect(
      dialog(page).getByRole("button", { name: "Cancel" }),
    ).toBeFocused();
    await page.keyboard.press("Tab");
    await page.keyboard.press("Enter");
    await expect(dialog(page)).toBeHidden();
    await expect(rows(page)).toHaveCount(0);
  });

  test("asks before resetting after a win too", async ({ page }) => {
    await winGame(page, answerName);
    await resetButton(page).click();
    await expect(dialog(page)).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(victory(page)).toBeVisible();
    await expect(midReset(page)).toBeHidden();
  });
});

test.describe("day rollover in an open tab", () => {
  test("a guess after midnight clears the old board and starts the new day", async ({
    page,
  }) => {
    await submitGuess(page, wrongName);
    await expect(rows(page)).toHaveCount(1);

    await serverMovesToNextDay(page, "**/api/games/petdle/grade");
    await submitGuess(page, wrongName);

    // Only the new day's guess is shown
    await expect(rows(page)).toHaveCount(1);
    await expect(victory(page)).toHaveCount(0);
  });

  test("a reload on a later server day clears a won game", async ({ page }) => {
    await winGame(page, answerName);
    await expect(victory(page)).toBeVisible();

    await serverMovesToNextDay(page, "**/api/games/petdle/grade");
    await page.reload();
    await expect(page.locator("#loading-state")).toBeHidden();

    await expect(victory(page)).toHaveCount(0);
    await expect(rows(page)).toHaveCount(0);
    await expect(input(page)).toBeVisible();
    await expect(resetButton(page)).toBeHidden();
  });

  test("giving up in a stale tab starts the new day instead of revealing", async ({
    page,
  }) => {
    await submitGuess(page, wrongName);
    await serverMovesToNextDay(page, "**/api/games/petdle/give-up");

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

    await serverMovesToNextDay(page, "**/api/games/petdle/give-up");
    await page.reload();
    await expect(page.locator("#loading-state")).toBeHidden();

    await expect(giveUpTitle(page)).toHaveCount(0);
    await expect(input(page)).toBeVisible();
    await expect(resetButton(page)).toBeHidden();
  });
});
