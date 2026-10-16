import { expect, test, type Page } from "@playwright/test";
import {
  mailTo,
  publishedMailpitUrl,
  tokenIn,
} from "../integration/mailpit.ts";

let counter = 0;
const freshEmail = (): string => `link${Date.now()}-${counter++}@example.test`;

// Types the address into the form and sends the link
const requestLink = async (page: Page, email: string): Promise<void> => {
  await page.locator("#login-email").fill(email);
  await page.locator("#login-button").click();
};
const status = (page: Page) => page.locator("#login-status");

test("request a link, read it from the inbox, open it and be signed in", async ({
  page,
}) => {
  const email = freshEmail();
  await page.goto("/");
  await requestLink(page, email);
  await expect(status(page)).toHaveText("Check your email");

  const mail = await mailTo(publishedMailpitUrl(), email);
  expect(mail.Subject).toBe("Your Petdle sign-in link");
  const token = tokenIn(mail.Text);
  await page.goto(`/?login=${token}`);

  await expect(page.locator("#account-name")).toHaveText(email);
  await expect(page.locator("#logout-button")).toBeVisible();
  await expect(page.locator("#login-form")).toBeHidden();
  // The token is gone from the address bar and the session survives a reload
  expect(page.url()).not.toContain("login=");
  await page.reload();
  await expect(page.locator("#account-name")).toHaveText(email);
});

test("a link works once: opening it again stays signed out with a message", async ({
  page,
  browser,
}) => {
  const email = freshEmail();
  await page.goto("/");
  await requestLink(page, email);
  const token = tokenIn((await mailTo(publishedMailpitUrl(), email)).Text);
  await page.goto(`/?login=${token}`);
  await expect(page.locator("#account-name")).toHaveText(email);

  const other = await browser.newPage();
  await other.goto(`/?login=${token}`);
  await expect(status(other)).toHaveText("That link is invalid or has expired");
  await expect(other.locator("#login-form")).toBeVisible();
  await expect(other.locator("#account-name")).toBeHidden();
  expect(other.url()).not.toContain("login=");
  await other.close();
});

test("a bogus link shows the error and the form", async ({ page }) => {
  await page.goto("/?login=not-a-real-token");
  await expect(status(page)).toHaveText("That link is invalid or has expired");
  await expect(page.locator("#login-form")).toBeVisible();
});

test("an invalid address is refused by the form before anything is sent", async ({
  page,
}) => {
  await page.goto("/");
  let sent = 0;
  await page.route("**/api/auth/email/request", (route) => {
    sent++;
    return route.continue();
  });
  await requestLink(page, "not-an-email");
  await expect(status(page)).toBeHidden();
  expect(sent).toBe(0);
});

for (const [code, message] of [
  [503, "Email sign-in is unavailable"],
  [429, "Too many requests, wait a moment"],
  [500, "Could not send the link, try again"],
] as const) {
  test(`a ${code} answer shows "${message}"`, async ({ page }) => {
    await page.route("**/api/auth/email/request", (route) =>
      route.fulfill({
        status: code,
        contentType: "application/json",
        body: JSON.stringify({ error: "x" }),
      }),
    );
    await page.goto("/");
    await requestLink(page, freshEmail());
    await expect(status(page)).toHaveText(message);
  });
}

test("signing out brings the form back", async ({ page }) => {
  const email = freshEmail();
  await page.goto("/");
  await requestLink(page, email);
  const token = tokenIn((await mailTo(publishedMailpitUrl(), email)).Text);
  await page.goto(`/?login=${token}`);
  await page.locator("#logout-button").click();
  await expect(page.locator("#login-form")).toBeVisible();
});
