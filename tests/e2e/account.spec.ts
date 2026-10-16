import { expect, test, type Page } from "@playwright/test";
import { GUESS_DATA } from "../../src/game/roster.ts";
import { findAnswerName, submitGuess } from "./helpers.ts";

// The real Google flow is checked by hand; here the test-only login stub signs in
const stubLogin = (
  page: Page,
  data: { email: string; name?: string; admin?: boolean },
): ReturnType<Page["request"]["post"]> =>
  page.request.post("/api/test/login", { data });

test("a signed-out visitor sees the Google sign-in link and no sign-out", async ({
  page,
}) => {
  await page.goto("/");
  const link = page.locator("#login-link");
  await expect(link).toBeVisible();
  await expect(link).toHaveAttribute("href", "/api/auth/google");
  await expect(page.locator("#logout-button")).toBeHidden();
  await expect(page.locator("#account-name")).toBeHidden();
});

test("signing in shows the name and a sign-out control", async ({ page }) => {
  await stubLogin(page, { email: "ann@example.test", name: "Ann" });
  await page.goto("/");

  await expect(page.locator("#account-name")).toHaveText("Ann");
  await expect(page.locator("#logout-button")).toBeVisible();
  await expect(page.locator("#login-link")).toBeHidden();
});

test("the session survives a reload", async ({ page }) => {
  await stubLogin(page, { email: "ann@example.test", name: "Ann" });
  await page.goto("/");
  await page.reload();

  await expect(page.locator("#account-name")).toHaveText("Ann");
});

test("an admin session is reported as admin by the API", async ({ page }) => {
  await stubLogin(page, { email: "root@example.test", admin: true });
  const me = await (await page.request.get("/api/me")).json();

  expect(me.user).toEqual({
    name: "root@example.test",
    email: "root@example.test",
    admin: true,
  });
});

test("signing out returns to signed-out and clears the local game", async ({
  page,
  request,
}) => {
  const answer = await findAnswerName(request);
  const wrong = GUESS_DATA.find((pet) => pet.name !== answer)!.name;
  await stubLogin(page, { email: "ann@example.test", name: "Ann" });
  await page.goto("/");
  await submitGuess(page, wrong);
  await expect(page.locator(".guess-result-row")).toHaveCount(1);

  await page.locator("#logout-button").click();

  await expect(page.locator("#login-link")).toBeVisible();
  await expect(page.locator("#logout-button")).toBeHidden();
  await expect(page.locator(".guess-result-row")).toHaveCount(0);
  await page.reload();
  await expect(page.locator(".guess-result-row")).toHaveCount(0);
  const me = await (await page.request.get("/api/me")).json();
  expect(me.user).toBeNull();
});

test("a session revoked on the server is signed out on the next load", async ({
  page,
}) => {
  await stubLogin(page, { email: "ann@example.test", name: "Ann" });
  await page.goto("/");
  await expect(page.locator("#account-name")).toBeVisible();

  // Same effect as an admin removing the session: the server forgets the cookie
  await page.context().clearCookies();
  await page.reload();

  await expect(page.locator("#login-link")).toBeVisible();
});

test("mutating requests that are not JSON or come from another origin are refused", async ({
  page,
}) => {
  await page.goto("/");
  const text = await page.request.post("/api/grade", {
    headers: { "Content-Type": "text/plain" },
    data: "{}",
  });
  expect(text.status()).toBe(415);
  const foreign = await page.request.post("/api/auth/logout", {
    headers: { Origin: "https://evil.example" },
    data: {},
  });
  expect(foreign.status()).toBe(403);
});
