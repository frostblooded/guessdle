import { expect, test, type Locator, type Page } from "@playwright/test";

const WCAG_AA = 4.5;

// Contrast ratio of an element's text color on its own background color
async function contrast(locator: Locator): Promise<number> {
  return locator.evaluate((el: Element): number => {
    const channels = (css: string): number[] =>
      css
        .match(/[\d.]+/g)!
        .slice(0, 3)
        .map(Number);
    const luminance = ([r, g, b]: number[]): number => {
      const [lr, lg, lb] = [r, g, b].map((v) => {
        const c = v! / 255;
        return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * lr! + 0.7152 * lg! + 0.0722 * lb!;
    };
    const style = getComputedStyle(el);
    const a = luminance(channels(style.color));
    const b = luminance(channels(style.backgroundColor));
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  });
}

const background = (page: Page): Promise<string> =>
  page.evaluate(() => getComputedStyle(document.body).backgroundColor);

const themeButton = (page: Page): Locator => page.locator("#theme-button");

const LIGHT_BG = "rgb(250, 250, 250)";

test.describe("dark OS preference, auto mode", () => {
  test.use({ colorScheme: "dark" });

  test("page is dark and everything is readable", async ({ page }) => {
    await page.goto("/g/petdle");
    expect(await background(page)).not.toBe(LIGHT_BG);
    await expect(themeButton(page)).toHaveAttribute(
      "aria-label",
      "Theme: auto. Click to change.",
    );
    await expect(themeButton(page)).toHaveText("Theme: auto");

    await expect(page.locator("#loading-state")).toBeHidden();
    await page.locator("#new-guess-input").fill("a");
    const option = page.locator("[role=option]").first();
    await expect(option).toBeVisible();

    const checks: Record<string, Locator> = {
      body: page.locator("body"),
      input: page.locator("#new-guess-input"),
      "autocomplete item": option,
      "column title": page.locator(".guess-result-title").first(),
      "nav link": page.locator(".nav a").first(),
      "sign in button": page.locator("#signin-link"),
      "submit button": page.locator("#submit-new-guess-button"),
    };
    for (const [name, locator] of Object.entries(checks)) {
      expect(await contrast(locator), name).toBeGreaterThanOrEqual(WCAG_AA);
    }
  });

  test("explicit light overrides the OS", async ({ page }) => {
    await page.goto("/");
    await themeButton(page).click();
    await expect(themeButton(page)).toHaveAttribute(
      "aria-label",
      "Theme: light. Click to change.",
    );
    await expect(themeButton(page)).toHaveText("Theme: light");
    expect(await background(page)).toBe(LIGHT_BG);
  });
});

test.describe("light OS preference", () => {
  test.use({ colorScheme: "light" });

  test("page is light and everything is readable", async ({ page }) => {
    await page.goto("/g/petdle");
    expect(await background(page)).toBe(LIGHT_BG);
    await expect(page.locator("#loading-state")).toBeHidden();
    await page.locator("#new-guess-input").fill("a");
    await expect(page.locator("[role=option]").first()).toBeVisible();
    for (const selector of [
      "body",
      "#new-guess-input",
      "[role=option]",
      ".guess-result-title",
      ".nav a",
      "#signin-link",
      "#theme-button",
    ]) {
      expect(
        await contrast(page.locator(selector).first()),
        selector,
      ).toBeGreaterThanOrEqual(WCAG_AA);
    }
  });

  test("button cycles auto, light, dark, auto", async ({ page }) => {
    await page.goto("/");
    const modes: string[] = [];
    for (let i = 0; i < 4; i++) {
      modes.push(
        (await themeButton(page).getAttribute("aria-label"))!.split(".")[0]!,
      );
      await themeButton(page).click();
    }
    expect(modes).toEqual([
      "Theme: auto",
      "Theme: light",
      "Theme: dark",
      "Theme: auto",
    ]);
  });

  test("stored dark applies before the bundle runs and survives reload", async ({
    page,
  }) => {
    await page.goto("/");
    await themeButton(page).click();
    await themeButton(page).click();
    expect(await background(page)).not.toBe(LIGHT_BG);
    await page.reload();
    expect(await background(page)).not.toBe(LIGHT_BG);
    await expect(themeButton(page)).toHaveAttribute(
      "aria-label",
      "Theme: dark. Click to change.",
    );
  });

  test("inline script sets data-theme without the bundle", async ({ page }) => {
    await page.route("**/dist/assets/*.js", (route) => route.abort());
    await page.addInitScript(() => localStorage.setItem("theme", "dark"));
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  });

  test("garbage stored value falls back to auto", async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem("theme", "purple"));
    await page.goto("/");
    await expect(page.locator("html")).not.toHaveAttribute("data-theme");
    await expect(themeButton(page)).toHaveAttribute(
      "aria-label",
      "Theme: auto. Click to change.",
    );
  });
});

for (const scheme of ["light", "dark"] as const) {
  test(`result colors and every other page are readable in ${scheme}`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto("/how-to-play");
    for (const selector of [
      ".help-example .correct",
      ".help-example .partially-correct",
      ".help-example .incorrect",
      ".help-head .cell",
    ]) {
      expect(
        await contrast(page.locator(selector).first()),
        selector,
      ).toBeGreaterThanOrEqual(WCAG_AA);
    }
    await page.goto("/login");
    for (const selector of [
      "#login-email",
      "#login-button",
      ".btn-secondary, .btn-quiet, #theme-button",
    ]) {
      expect(
        await contrast(page.locator(selector).first()),
        selector,
      ).toBeGreaterThanOrEqual(WCAG_AA);
    }
    await page.locator("#login-email").fill("nope");
    await page.locator("#login-button").click();
    expect(
      await contrast(page.locator("#login-status")),
      "error",
    ).toBeGreaterThanOrEqual(WCAG_AA);
  });

  test(`the 404 page follows the ${scheme} theme`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto("/nowhere");
    expect((await background(page)) === LIGHT_BG).toBe(scheme === "light");
  });
}

test("the theme choice carries over to other pages", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/");
  await themeButton(page).click();
  await themeButton(page).click();
  await page.goto("/login");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(themeButton(page)).toHaveText("Theme: dark");
  expect(await background(page)).not.toBe(LIGHT_BG);
});

test("the header fits a phone: theme and account controls beside the brand, nav below", async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 640 });
  await page.goto("/");
  const brand = (await page.locator(".brand").boundingBox())!;
  const theme = (await themeButton(page).boundingBox())!;
  const signIn = (await page.locator("#signin-link").boundingBox())!;
  const nav = (await page.locator(".nav").boundingBox())!;
  expect(brand.x + brand.width).toBeLessThanOrEqual(theme.x);
  expect(theme.x + theme.width).toBeLessThanOrEqual(signIn.x);
  expect(signIn.x + signIn.width).toBeLessThanOrEqual(360);
  expect(nav.y).toBeGreaterThanOrEqual(brand.y + brand.height - 1);
});
