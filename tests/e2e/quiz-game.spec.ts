import { expect, test } from "@playwright/test";

const unique = (): string =>
  `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

test("a Quiz game is written in the editor, then taken and scored", async ({
  page,
}) => {
  await page.request.post("/api/test/login", {
    data: { email: `quiz-${unique()}@example.test` },
  });
  await page.goto("/create");
  await page.locator("#game-name").fill(`Quiz ${unique()}`);
  await page.locator("#game-kind-quiz").check();
  await page.locator("#create-button").click();
  await expect(page).toHaveURL(/\/edit$/);
  const slug = new URL(page.url()).pathname.split("/")[2]!;

  // Questions instead of attributes, entries and daily answers
  await expect(page.locator("#tab-attributes")).toHaveCount(0);
  await expect(page.locator("#tab-answers")).toHaveCount(0);
  await page.locator("#tab-entries").click();
  await expect(page.locator("#tab-entries")).toHaveText("Questions");

  await page.locator("#question-new").click();
  await page.locator("#question-prompt").fill("Which planet is largest?");
  await page.locator("#question-option-0").fill("Mars");
  await page.locator("#question-option-1").fill("Jupiter");
  await page.locator("#question-add-option").click();
  await page.locator("#question-option-2").fill("Venus");
  await page.locator("#question-correct-1").check();
  await page.locator("#question-submit").click();
  await expect(page.locator("#question-list li")).toHaveCount(1);

  await page.locator("#question-new").click();
  await page.locator("#question-prompt").fill("When did the Berlin Wall fall?");
  await page.locator("#question-type-number").check();
  await page.locator("#question-answer").fill("1989");
  await page.locator("#question-range").fill("10");
  await page.locator("#question-submit").click();
  await expect(page.locator("#question-list li")).toHaveCount(2);

  await page.goto(`/g/${slug}`);
  await expect(page.locator("#quiz-progress")).toHaveText("Question 1 of 2");
  await page.getByRole("radio", { name: "Jupiter" }).click();
  await page.locator("#quiz-next").click();
  await page.locator("#quiz-number").fill("1994");
  await page.locator("#quiz-finish").click();
  await expect(page.locator("#quiz-score")).toHaveText("1.5 / 2");
  await expect(page.locator("#quiz-review li")).toHaveCount(2);
  await expect(page.locator("#quiz-review")).toContainText(
    "Right answer: 1989",
  );

  // A retake starts over; the first score is the one that counts
  await page.locator("#quiz-retake").click();
  await page.getByRole("radio", { name: "Mars" }).click();
  await page.locator("#quiz-next").click();
  await page.locator("#quiz-finish").click();
  await expect(page.locator("#quiz-score")).toHaveText("0 / 2");
  await expect(page.locator("#quiz-first")).toContainText("1.5 / 2");
});

test("a Quiz party plays one question per round, then runs out", async ({
  page,
  browser,
  baseURL,
}) => {
  await page.request.post("/api/test/login", {
    data: { email: `quiz-${unique()}@example.test` },
  });
  const created = await page.request.post("/api/games", {
    data: { name: `Quiz ${unique()}`, kind: "quiz" },
  });
  const { slug } = (await created.json()) as { slug: string };
  await page.request.post(`/api/games/${slug}/entries`, {
    data: {
      name: "Which planet is largest?",
      quiz: { options: ["Mars", "Jupiter"], correct: 1 },
    },
  });

  await page.goto(`/party?host=${slug}`);
  await page.locator("#host-nickname").fill("Ana");
  await page.locator("#host-button").click();
  await expect(page).toHaveURL(/\/party\/[A-Z]{4}$/);
  const code = page.url().slice(-4);
  const guest = await (
    await browser.newContext({ baseURL: baseURL! })
  ).newPage();
  await guest.goto(`/party/${code}`);
  await guest.locator("#join-nickname").fill("Bo");
  await guest.locator("#join-button").click();
  await expect(page.locator(".party-player")).toHaveCount(2);

  await page.locator("#start-round").click();
  await guest.getByRole("radio", { name: "Jupiter" }).click();
  await guest.locator("#quiz-answer").click();
  await expect(guest.locator("#result-banner")).toContainText("Jupiter");
  // The host sees that Bo answered, not whether it was right
  await expect(page.locator(".party-player", { hasText: "Bo" })).toContainText(
    "Answered",
  );
  await page.getByRole("radio", { name: "Mars" }).click();
  await page.locator("#quiz-answer").click();

  for (const p of [page, guest]) {
    await expect(p.locator(".party-round")).toContainText(
      "The right answer was Jupiter",
    );
    await expect(p.locator(".party-result").first()).toContainText("Bo");
  }
  await expect(page.locator("#start-round")).toHaveCount(0);
  await expect(page.locator("#waiting")).toContainText("last question");
});
