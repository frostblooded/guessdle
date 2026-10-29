import { expect, test, type Browser, type Page } from "@playwright/test";
import { GUESS_DATA } from "./roster.ts";

let counter = 0;
const newEmail = (): string =>
  `party${Date.now()}${Math.random().toString(36).slice(2, 6)}-${counter++}@example.test`;

// A phone-sized guest in its own browser
async function phone(browser: Browser, baseURL: string): Promise<Page> {
  const context = await browser.newContext({
    baseURL,
    viewport: { width: 375, height: 740 },
    hasTouch: true,
  });
  return context.newPage();
}

// The original game, which the suite always has
const SLUG = "petdle";

// Opens a party on it from the Play page; returns its code
async function hostParty(
  page: Page,
  nickname: string = "Ana",
  select: boolean = false,
): Promise<string> {
  await page.request.post("/api/test/login", { data: { email: newEmail() } });
  await page.goto("/g/petdle");
  await page.locator("#party-host-link").click();
  await expect(page).toHaveURL(new RegExp(`/party\\?host=${SLUG}$`));
  await expect(page.locator("#host-form")).toBeVisible();
  await page.locator("#host-nickname").fill(nickname);
  if (select) {
    await page.locator("#guess-mode-select").click();
  }
  await page.locator("#host-button").click();
  await expect(page).toHaveURL(/\/party\/[A-Z]{4}$/);
  return page.url().slice(-4);
}

// Guesses names in roster order until the round says solved
async function solve(page: Page): Promise<void> {
  for (const pet of GUESS_DATA) {
    if (await page.locator(".banner-victory").isVisible()) {
      return;
    }
    const rows = await page.locator(".guess-result-row").count();
    await page.locator("#new-guess-input").fill(pet.name);
    await page.locator("#submit-new-guess-button").click();
    await expect(page.locator(".guess-result-row")).toHaveCount(rows + 1);
  }
  await expect(page.locator(".banner-victory")).toBeVisible();
}

test("a signed-out visitor is sent to sign in before hosting", async ({
  page,
}) => {
  await page.goto("/g/petdle");
  await page.locator("#party-host-link").click();
  await expect(page).toHaveURL(
    new RegExp(`/login\\?next=%2Fparty%3Fhost%3D${SLUG}$`),
  );
});

test("a host and a phone play a round, then the party ends on a podium", async ({
  page,
  browser,
  baseURL,
}) => {
  const code = await hostParty(page);
  await expect(page.locator("#party-code")).toHaveText(code);
  await expect(page.locator("#qr svg")).toBeVisible();
  await expect(page.locator("#waiting")).toContainText("Start the first round");

  // The guest scans the QR: the link opens the join form
  const guest = await phone(browser, baseURL!);
  await guest.goto(`/party/${code}`);
  await guest.locator("#join-nickname").fill("Bo");
  await guest.locator("#join-button").click();
  await expect(guest.locator("#join-form")).toBeHidden();
  await expect(guest.locator("#waiting")).toContainText("Waiting for the host");
  await expect(page.locator(".party-player")).toHaveCount(2);

  await page.locator("#start-round").click();
  await expect(guest.locator("#round-title")).toHaveText("Round 1");
  await expect(page.locator("#end-round")).toBeVisible();

  await solve(guest);
  // The host sees the guest's progress live, without the guesses
  await expect(page.locator(".party-player", { hasText: "Bo" })).toContainText(
    "solved",
  );
  await page.locator("#give-up-button").click();

  // Round over: both see the result, Bo first with 2 points
  for (const p of [page, guest]) {
    await expect(p.locator(".party-round")).toHaveCount(1);
    await expect(p.locator(".party-result").first()).toContainText("Bo");
    await expect(p.locator(".party-result").first()).toContainText(
      /guess(es)? in \d+:\d\d/,
    );
    await expect(p.locator(".party-player").first()).toContainText("2 points");
  }
  await expect(page.locator("#start-round")).toHaveText("Start round 2");

  // A dropped phone comes back as the same player
  await guest.reload();
  await expect(guest.locator("#join-form")).toBeHidden();
  await expect(
    guest.locator(".party-player", { hasText: "(you)" }),
  ).toContainText("Bo");

  await page.locator("#end-party").click();
  await page.locator("#end-dialog button[value=confirm]").click();
  for (const p of [page, guest]) {
    await expect(p.locator("#party-title")).toContainText("final standings");
    await expect(p.locator(".podium-1")).toContainText("Bo");
  }
  await expect(page.locator("#host-controls")).toBeHidden();

  // The link stays a read-only results page
  const visitor = await phone(browser, baseURL!);
  await visitor.goto(`/party/${code}`);
  await expect(visitor.locator(".podium-1")).toContainText("Bo");
  await expect(visitor.locator("#join-form")).toBeHidden();
});

test("a late joiner plays the live round, and the host can remove a player", async ({
  page,
  browser,
  baseURL,
}) => {
  const code = await hostParty(page);
  await page.locator("#start-round").click();
  await expect(page.locator("#round-title")).toHaveText("Round 1");

  const late = await phone(browser, baseURL!);
  await late.goto(`/party/${code}`);
  await late.locator("#join-nickname").fill("Cy");
  await late.locator("#join-button").click();
  await expect(late.locator("#new-guess-input")).toBeVisible();

  const row = page.locator(".party-player", { hasText: "Cy" });
  await expect(row).toBeVisible();
  page.once("dialog", (dialog) => void dialog.accept());
  await row.getByRole("button", { name: "Remove Cy" }).click();
  await expect(page.locator(".party-player")).toHaveCount(1);
  await expect(late.locator("#notice")).toContainText("removed you");
  await expect(late.locator("#join-form")).toBeVisible();
});

test("every player guesses the way the host picked, with no switch of their own", async ({
  page,
  browser,
  baseURL,
}) => {
  const code = await hostParty(page, "Ana", true);
  await page.locator("#start-round").click();

  const guest = await phone(browser, baseURL!);
  await guest.goto(`/party/${code}`);
  await guest.locator("#join-nickname").fill("Cy");
  await guest.locator("#join-button").click();
  await expect(guest.locator("#select-guess-button")).toBeVisible();
  await expect(guest.locator("#guess-mode")).toHaveCount(0);
  await expect(guest.locator("#new-guess-input")).toHaveCount(0);

  const name = GUESS_DATA[0]!.name;
  await guest.locator("#select-guess-button").click();
  await guest
    .getByRole("button", { name: `Guess ${name}`, exact: true })
    .click();
  await expect(
    guest.getByRole("button", { name: `Guess ${name}`, exact: true }),
  ).toHaveCount(0);
  await expect(guest.locator("#guess-results-container")).toContainText(name);
});

test("the code form finds a party, and an unknown code says so", async ({
  page,
  browser,
  baseURL,
}) => {
  const code = await hostParty(page);
  const guest = await phone(browser, baseURL!);
  await guest.goto("/party");
  await guest.locator("#code-input").fill(code.toLowerCase());
  await guest.getByRole("button", { name: "Find party" }).click();
  await expect(guest).toHaveURL(new RegExp(`/party/${code}$`));
  await expect(guest.locator("#join-form")).toBeVisible();

  await guest.goto("/party/ZZZZ");
  await expect(guest.locator("#party-error")).toContainText(
    "no party with this code",
  );
  await expect(guest.locator("#code-form")).toBeVisible();
});

test("the party page fits a 320px phone", async ({
  page,
  browser,
  baseURL,
}) => {
  const code = await hostParty(page);
  await page.locator("#start-round").click();
  const small = await (
    await browser.newContext({
      baseURL: baseURL!,
      viewport: { width: 320, height: 568 },
    })
  ).newPage();
  await small.goto(`/party/${code}`);
  await small.locator("#join-nickname").fill("Narrow");
  await small.locator("#join-button").click();
  await expect(small.locator("#new-guess-input")).toBeVisible();
  const [scroll, client] = await small.evaluate(() => [
    document.documentElement.scrollWidth,
    document.documentElement.clientWidth,
  ]);
  expect(scroll).toBeLessThanOrEqual(client!);
});
