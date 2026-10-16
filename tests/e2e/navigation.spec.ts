import { expect, test } from "@playwright/test";
import { GUESS_DATA } from "./roster.ts";
import { submitGuess } from "./helpers.ts";

const PAGES = [
  ["/", "Pick a game"],
  ["/how-to-play", "How to play"],
  ["/login", "Sign in or sign up"],
  ["/admin", /Sign in required|403|^Admin$/],
] as const;

for (const [path, heading] of PAGES) {
  test(`${path} has the shell landmarks, one h1 and a skip link`, async ({
    page,
  }) => {
    await page.goto(path);
    await expect(page.getByRole("banner")).toBeVisible();
    await expect(page.getByRole("main")).toBeVisible();
    await expect(page.getByRole("contentinfo")).toBeVisible();
    await expect(
      page.getByRole("navigation", { name: "Main" }).getByRole("link"),
    ).toHaveText(["Games", "How to play"]);
    await expect(page.locator("h1:visible")).toHaveCount(1);
    await expect(page.locator("h1:visible")).toHaveText(heading);
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await page.keyboard.press("Tab");
    await expect(
      page.getByRole("link", { name: "Skip to content" }),
    ).toBeFocused();
  });
}

test("the nav marks the current page and moves between pages without hashes", async ({
  page,
}) => {
  await page.goto("/");
  const nav = page.getByRole("navigation", { name: "Main" });
  await expect(
    nav.getByRole("link", { name: "Games", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  await nav.getByRole("link", { name: "How to play" }).click();
  await expect(page).toHaveURL(/\/how-to-play$/);
  await expect(nav.getByRole("link", { name: "How to play" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(
    nav.getByRole("link", { name: "Games", exact: true }),
  ).not.toHaveAttribute("aria-current", "page");
  await page.getByRole("link", { name: "Sign in" }).first().click();
  await expect(page).toHaveURL(/\/login$/);
  await page.locator(".brand").click();
  await expect(page).toHaveURL(/\/$/);
  expect(page.url()).not.toContain("#");
});

test("the signed-out account area offers Sign in / Sign up", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator("#signin-link")).toHaveText("Sign in / Sign up");
  await page.setViewportSize({ width: 360, height: 640 });
  await expect(page.locator("#signin-link")).toHaveText("Sign in", {
    useInnerText: true,
  });
});

test("keyboard users can reach and use the account menu", async ({ page }) => {
  await page.request.post("/api/test/login", {
    data: { email: `kb-${Date.now()}@example.test` },
  });
  await page.goto("/");
  await page.locator("#user-menu-button").focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("#user-menu-panel")).toBeVisible();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "My games" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.locator("#logout-button")).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("#signin-link")).toBeVisible();
});

test("status messages are announced through live regions", async ({ page }) => {
  await page.goto("/g/petdle");
  await expect(page.locator("#notice")).toHaveAttribute("role", "status");
  await expect(page.locator("#result-banner")).toHaveAttribute(
    "aria-live",
    "polite",
  );
  await page.goto("/login");
  await expect(page.locator("#login-status")).toHaveAttribute("role", "alert");
  await expect(page.locator("label[for=login-email]")).toHaveText(
    "Email address",
  );
});

test("the play page shows loading, then the empty state", async ({ page }) => {
  await page.route("**/api/**", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 400));
    await route.continue();
  });
  await page.goto("/g/petdle");
  await expect(page.locator("#loading-state")).toBeVisible();
  await expect(page.locator("#empty-state")).toBeVisible();
  await expect(page.locator("#loading-state")).toBeHidden();
});

test("a failed game load is reported, not silent", async ({ page }) => {
  await page.goto("/g/petdle");
  await submitGuess(page, GUESS_DATA[0]!.name);
  await page.route("**/api/games/petdle/grade", (route) => route.abort());
  await page.reload();
  await expect(page.locator("#notice")).toContainText(
    "Could not load your game",
  );
});

test("unknown paths get the styled 404 with a way home", async ({ page }) => {
  const response = await page.goto("/nope/nothing");
  expect(response!.status()).toBe(404);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("404");
  await page.getByRole("link", { name: "Back to GUESSDLE" }).click();
  await expect(page).toHaveURL(/\/$/);
});

test("the old /?login= links no longer sign anyone in", async ({ page }) => {
  await page.goto("/?login=abc");
  await expect(page.locator("#signin-link")).toBeVisible();
});

test("old un-namespaced browser guesses are cleared once, with a notice", async ({
  page,
}) => {
  await page.addInitScript(() => {
    if (!sessionStorage.getItem("seeded")) {
      sessionStorage.setItem("seeded", "1");
      localStorage.setItem("usedGuesses", "[1]");
    }
  });
  await page.goto("/g/petdle");
  await expect(page.locator("#reset-notice")).toContainText("reset once");
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem("usedGuesses")))
    .toBeNull();
  await page.reload();
  await expect(page.locator("#reset-notice")).toHaveCount(0);
});
