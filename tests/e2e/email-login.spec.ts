import { expect, test, type Page } from "@playwright/test";
import {
  mailTo,
  publishedMailpitUrl,
  tokenIn,
} from "../integration/mailpit.ts";
import { GUESS_DATA } from "./roster.ts";
import { findAnswerName, signOutViaMenu, submitGuess } from "./helpers.ts";

let counter = 0;
const freshEmail = (): string => `link${Date.now()}-${counter++}@example.test`;

// Types the address into the form and sends the link
const requestLink = async (page: Page, email: string): Promise<void> => {
  await page.locator("#login-email").fill(email);
  await page.locator("#login-button").click();
};
const status = (page: Page) => page.locator("#login-status");

// Requests a link on the login page and returns the token from the mail
async function tokenFor(page: Page, email: string): Promise<string> {
  await page.goto("/login");
  await requestLink(page, email);
  await expect(page.locator("#login-sent")).toBeVisible();
  return tokenIn((await mailTo(publishedMailpitUrl(), email)).Text);
}

test("request a link, read it from the inbox, open it and be signed in", async ({
  page,
}) => {
  const email = freshEmail();
  await page.goto("/login");
  await requestLink(page, email);
  await expect(
    page.getByRole("heading", { name: "Check your email" }),
  ).toBeVisible();
  await expect(page.locator("#sent-address")).toHaveText(email);

  const mail = await mailTo(publishedMailpitUrl(), email);
  expect(mail.Subject).toBe("Your Petdle sign-in link");
  expect(mail.Text).toMatch(/\/verify\?token=/);
  await page.goto(`/verify?token=${tokenIn(mail.Text)}`);

  // The link lands on Play, signed in
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator("#account-name")).toHaveText(email);
  // The session survives a reload
  await page.reload();
  await expect(page.locator("#account-name")).toHaveText(email);
});

test("the sign-in page says sign in and sign up are the same flow", async ({
  page,
}) => {
  await page.goto("/login");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Sign in or sign up",
  );
  await expect(page.locator("#login-intro")).toContainText(
    "creates your account",
  );
  await expect(page.locator("#login-intro")).toContainText("No password");
});

test("local guesses made before signing in are merged into the account", async ({
  page,
  request,
}) => {
  const answer = await findAnswerName(request);
  const wrong = GUESS_DATA.find((pet) => pet.name !== answer)!.name;
  await page.goto("/");
  await submitGuess(page, wrong);
  const token = await tokenFor(page, freshEmail());

  await page.goto(`/verify?token=${token}`);
  await expect(page.locator("#account-name")).toBeVisible();
  await expect(page.locator(".guess-result-row")).toHaveCount(1);
  expect(
    await page.evaluate(() => localStorage.getItem("game:petdle:usedGuesses")),
  ).toBe(null);
});

test("a link works once: opening it again shows the error with a way to get a new one", async ({
  page,
  browser,
}) => {
  const token = await tokenFor(page, freshEmail());
  await page.goto(`/verify?token=${token}`);
  await expect(page.locator("#account-name")).toBeVisible();

  const other = await browser.newPage();
  await other.goto(`/verify?token=${token}`);
  await expect(other.locator("#verify-failed")).toBeVisible();
  await expect(other.locator("#verify-reason")).toContainText(
    "invalid, has expired or was already used",
  );
  await expect(other.locator("#verify-working")).toBeHidden();
  // The spent token is gone from the address bar
  expect(other.url()).not.toContain("token=");
  await other.getByRole("link", { name: "Get a new link" }).click();
  await expect(other).toHaveURL(/\/login$/);
  await expect(other.locator("#login-form")).toBeVisible();
  await other.close();
});

test("a bogus link shows the error and no session", async ({ page }) => {
  await page.goto("/verify?token=not-a-real-token");
  await expect(page.locator("#verify-failed")).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "This link did not work",
  );
  await expect(page.locator("#signin-link")).toBeVisible();
});

test("a link without a token explains itself", async ({ page }) => {
  await page.goto("/verify");
  await expect(page.locator("#verify-reason")).toContainText("incomplete");
  await expect(
    page.getByRole("link", { name: "Get a new link" }),
  ).toBeVisible();
});

test("an unreachable server keeps the token so Try again can sign in", async ({
  page,
}) => {
  const token = await tokenFor(page, freshEmail());
  await page.route("**/api/auth/email/verify", (route) => route.abort());
  await page.goto(`/verify?token=${token}`);
  await expect(page.locator("#verify-reason")).toContainText(
    "Could not reach the server",
  );
  await expect(page.getByRole("link", { name: "Get a new link" })).toBeHidden();
  expect(page.url()).toContain(`token=${token}`);

  await page.unroute("**/api/auth/email/verify");
  await page.getByRole("link", { name: "Try again" }).click();
  await expect(page.locator("#account-name")).toBeVisible();
});

test("a 429 on verify is retryable too", async ({ page }) => {
  await page.route("**/api/auth/email/verify", (route) =>
    route.fulfill({
      status: 429,
      contentType: "text/plain",
      body: "slow down",
    }),
  );
  await page.goto("/verify?token=abc");
  await expect(page.locator("#verify-reason")).toContainText(
    "Too many attempts",
  );
  await expect(page.getByRole("link", { name: "Try again" })).toBeVisible();
});

test("an invalid address is refused by the form before anything is sent", async ({
  page,
}) => {
  await page.goto("/login");
  let sent = 0;
  await page.route("**/api/auth/email/request", (route) => {
    sent++;
    return route.continue();
  });
  await requestLink(page, "not-an-email");
  await expect(status(page)).toHaveText("Enter a valid email address.");
  await expect(page.locator("#login-email")).toHaveAttribute(
    "aria-invalid",
    "true",
  );
  expect(sent).toBe(0);
  // Typing again clears the error
  await page.locator("#login-email").fill("a");
  await expect(status(page)).toBeHidden();
});

test("the form shows a sending state while the request is in flight", async ({
  page,
}) => {
  await page.goto("/login");
  let release!: () => void;
  const gate = new Promise<void>((resolve) => (release = resolve));
  await page.route("**/api/auth/email/request", async (route) => {
    await gate;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: '{"ok":true}',
    });
  });
  await requestLink(page, freshEmail());
  await expect(page.locator("#login-button")).toBeDisabled();
  await expect(page.locator("#login-button")).toHaveText("Sending…");
  release();
  await expect(page.locator("#login-sent")).toBeVisible();
});

for (const [code, message] of [
  [
    503,
    "Email sign-in is unavailable right now. You can still play without an account.",
  ],
  [429, "Too many requests. Wait a minute, then try again."],
  [500, "Could not send the link. Check your connection and try again."],
] as const) {
  test(`a ${code} answer shows "${message}"`, async ({ page }) => {
    await page.route("**/api/auth/email/request", (route) =>
      route.fulfill({
        status: code,
        contentType: "application/json",
        body: JSON.stringify({ error: "x" }),
      }),
    );
    await page.goto("/login");
    await requestLink(page, freshEmail());
    await expect(status(page)).toHaveText(message);
    // The form stays usable for another try
    await expect(page.locator("#login-form")).toBeVisible();
    await expect(page.locator("#login-button")).toBeEnabled();
  });
}

test("resend is blocked for a minute, then sends again; a different email goes back to the form", async ({
  page,
}) => {
  await page.clock.install();
  await page.goto("/login");
  let requests = 0;
  await page.route("**/api/auth/email/request", (route) => {
    requests++;
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: '{"ok":true}',
    });
  });
  await requestLink(page, freshEmail());
  const resend = page.locator("#resend-button");
  await expect(resend).toBeDisabled();
  await expect(resend).toHaveText("Resend link in 60s");

  await page.clock.fastForward(30_000);
  await expect(resend).toHaveText(/Resend link in (2\d|30)s/);
  await expect(resend).toBeDisabled();

  await page.clock.fastForward(31_000);
  await expect(resend).toHaveText("Resend link");
  await expect(resend).toBeEnabled();
  await resend.click();
  await expect(page.locator("#resend-status")).toHaveText(
    "Sent again. It can take a minute to arrive.",
  );
  expect(requests).toBe(2);
  await expect(resend).toBeDisabled();

  await page.getByRole("button", { name: "Use a different email" }).click();
  await expect(page.locator("#login-form")).toBeVisible();
  await expect(page.locator("#login-sent")).toBeHidden();
  await expect(page.locator("#login-email")).toBeFocused();
});

test("a failed resend shows its error and stays retryable", async ({
  page,
}) => {
  await page.clock.install();
  await page.goto("/login");
  let first = true;
  await page.route("**/api/auth/email/request", (route) => {
    const ok = first;
    first = false;
    return route.fulfill({
      status: ok ? 200 : 503,
      contentType: "application/json",
      body: '{"ok":true}',
    });
  });
  await requestLink(page, freshEmail());
  await expect(page.locator("#login-sent")).toBeVisible();
  await page.clock.fastForward(61_000);
  await page.locator("#resend-button").click();
  await expect(page.locator("#resend-status")).toContainText("unavailable");
  await expect(page.locator("#resend-button")).toBeEnabled();
});

test("a signed-in visitor on the sign-in page is told so", async ({ page }) => {
  const email = freshEmail();
  await page.request.post("/api/test/login", { data: { email } });
  await page.goto("/login");
  await expect(page.locator("#login-signed-in")).toBeVisible();
  await expect(page.locator("#signed-in-as")).toHaveText(email);
  await expect(page.locator("#login-card")).toBeHidden();
});

test("signing out brings the sign-in link back", async ({ page }) => {
  const token = await tokenFor(page, freshEmail());
  await page.goto(`/verify?token=${token}`);
  await signOutViaMenu(page);
  await expect(page.locator("#signin-link")).toBeVisible();
});
