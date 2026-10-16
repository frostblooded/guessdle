import { expect, test, type Page } from "@playwright/test";
import { GUESS_DATA } from "./roster.ts";
import { findAnswerName, submitGuess } from "./helpers.ts";

// Phones (small to large, portrait and landscape) and a small tablet
const VIEWPORTS = [
  { name: "320x568 small phone", width: 320, height: 568 },
  { name: "360x640 Android", width: 360, height: 640 },
  { name: "375x667 iPhone SE", width: 375, height: 667 },
  { name: "390x844 iPhone 14", width: 390, height: 844 },
  { name: "412x914 Samsung Galaxy A53", width: 412, height: 914 },
  { name: "430x932 large phone", width: 430, height: 932 },
  { name: "667x375 landscape", width: 667, height: 375 },
  { name: "768x1024 tablet", width: 768, height: 1024 },
] as const;

const DAY = new Date(2025, 7, 18, 12);

// Worst cases for layout: the longest name and the pets with the most colors and owners
const others = GUESS_DATA;
const byLongest = (key: (p: (typeof GUESS_DATA)[number]) => number) =>
  [...others].sort((a, b) => key(b) - key(a))[0]!.name;
const WORST_GUESSES: string[] = [
  ...new Set([
    byLongest((p) => p.name.length),
    byLongest((p) => p.colors.join(", ").length),
    byLongest((p) => p.owners.join(", ").length),
    others[0]!.name,
  ]),
];

// Page-side checks. Returns a list of human-readable problems; empty means fine.
// Runs inside the browser, so it must not reference anything from this file.
function findLayoutProblems(): string[] {
  window.scrollTo(0, 0);
  const problems: string[] = [];
  const vw = document.documentElement.clientWidth;
  const label = (el: Element): string =>
    el.id ? `#${el.id}` : `${el.tagName.toLowerCase()}.${el.className}`;
  const shown = (el: Element): boolean => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && el.checkVisibility();
  };
  const all = (sel: string): Element[] =>
    [...document.querySelectorAll(sel)].filter(shown);

  if (document.documentElement.scrollWidth > vw) {
    problems.push(
      `page scrolls sideways (${document.documentElement.scrollWidth} > ${vw})`,
    );
  }

  const blocks = all(
    ".brand, .nav, #theme-button, #signin-link, #user-menu-button, h1, #new-guess-input, #submit-new-guess-button, #guess-results-titles-row, .guess-result-row, #victory-title, #victory-answer-name, .auth-card, .help-step, .tabs",
  );
  for (const el of blocks) {
    const r = el.getBoundingClientRect();
    if (r.left < -0.5 || r.right > vw + 0.5) {
      problems.push(`${label(el)} leaves the screen (${r.left}..${r.right})`);
    }
  }
  const overlaps = (a: Element, b: Element): boolean => {
    if (a.contains(b) || b.contains(a)) {
      return false;
    }
    const x = a.getBoundingClientRect();
    const y = b.getBoundingClientRect();
    return (
      Math.min(x.right, y.right) - Math.max(x.left, y.left) > 1 &&
      Math.min(x.bottom, y.bottom) - Math.max(x.top, y.top) > 1
    );
  };
  for (let i = 0; i < blocks.length; i++) {
    for (let j = i + 1; j < blocks.length; j++) {
      if (overlaps(blocks[i]!, blocks[j]!)) {
        problems.push(`${label(blocks[i]!)} overlaps ${label(blocks[j]!)}`);
      }
    }
  }
  for (const row of all(".guess-result-row, #guess-results-titles-row")) {
    const cells = [...row.children].filter(shown);
    for (let i = 0; i < cells.length; i++) {
      for (let j = i + 1; j < cells.length; j++) {
        if (overlaps(cells[i]!, cells[j]!)) {
          problems.push(`cells ${i} and ${j} overlap in ${label(row)}`);
        }
      }
    }
  }
  for (const cell of all(".guess-result-cell, .guess-result-title")) {
    if (cell.scrollWidth > cell.clientWidth + 1) {
      problems.push(`text clipped in "${cell.textContent}"`);
    }
  }

  const tappable = all("button, input");
  for (const el of tappable) {
    const r = el.getBoundingClientRect();
    if (r.width < 24 || r.height < 24) {
      problems.push(`${label(el)} too small to tap (${r.width}x${r.height})`);
    }
    // Something else drawn on top of the control's center would eat the tap
    const top = document.elementFromPoint(
      r.left + r.width / 2,
      r.top + r.height / 2,
    );
    if (top !== null && !el.contains(top) && !top.contains(el)) {
      problems.push(`${label(el)} is covered by ${label(top)}`);
    }
  }
  for (const el of all("button, input, h1, h2, h3, p, span, b, .cell")) {
    const size = parseFloat(getComputedStyle(el).fontSize);
    if (size < 12) {
      problems.push(`${label(el)} font is ${size}px (< 12px)`);
    }
  }
  return problems;
}

async function expectNoProblems(page: Page): Promise<void> {
  expect(await page.evaluate(findLayoutProblems)).toEqual([]);
}

for (const { name, width, height } of VIEWPORTS) {
  test.describe(`layout at ${name}`, () => {
    test.use({ viewport: { width, height } });

    test.beforeEach(async ({ page }) => {
      await page.clock.install({ time: DAY });
      await page.goto("/");
    });

    test("empty game", async ({ page }) => {
      await expectNoProblems(page);
    });

    test("with worst-case guess rows", async ({ page }) => {
      for (const guess of WORST_GUESSES) {
        await submitGuess(page, guess);
      }
      await expect(page.locator(".guess-result-row")).toHaveCount(
        WORST_GUESSES.length,
      );
      await expectNoProblems(page);
    });

    test("victory", async ({ page, request }) => {
      const answerName = await findAnswerName(request);
      const wrong = WORST_GUESSES.find((guess) => guess !== answerName)!;
      await submitGuess(page, wrong);
      await submitGuess(page, answerName);
      await expect(page.locator("#victory-title")).toBeVisible();
      await expectNoProblems(page);
    });

    test("reset confirmation dialog", async ({ page }) => {
      await submitGuess(page, WORST_GUESSES[0]!);
      await page.locator("#reset-guesses-button").click();
      const box = await page.locator("#reset-dialog").boundingBox();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(width);
      expect(box!.y).toBeGreaterThanOrEqual(0);
      expect(box!.y + box!.height).toBeLessThanOrEqual(height);
    });

    test("autocomplete suggestions", async ({ page }) => {
      await page.locator("#new-guess-input").fill("a");
      await expect(page.locator("[role=option]").first()).toBeVisible();
      const list = await page.locator("[role=listbox]").boundingBox();
      expect(list!.x).toBeGreaterThanOrEqual(0);
      expect(list!.x + list!.width).toBeLessThanOrEqual(width);
      // The open list overlays the Reset button by design
      const problems = await page.evaluate(findLayoutProblems);
      expect(
        problems.filter(
          (p) =>
            p !== "#reset-guesses-button is covered by #autoComplete_result_0",
        ),
      ).toEqual([]);
    });

    test("how-to-play page", async ({ page }) => {
      await page.goto("/how-to-play");
      await expectNoProblems(page);
    });

    test("sign-in page: idle, error, check-your-email", async ({ page }) => {
      await page.goto("/login");
      await expectNoProblems(page);
      await page.locator("#login-email").fill("nope");
      await page.locator("#login-button").click();
      await expect(page.locator("#login-status")).toBeVisible();
      await expectNoProblems(page);
      await page.route("**/api/auth/email/request", (route) =>
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: '{"ok":true}',
        }),
      );
      await page
        .locator("#login-email")
        .fill("a-rather-long-address-to-wrap-in-the-card@example.test");
      await page.locator("#login-button").click();
      await expect(page.locator("#login-sent")).toBeVisible();
      await expectNoProblems(page);
    });

    test("link landing page and its error", async ({ page }) => {
      await page.goto("/verify?token=bogus");
      await expect(page.locator("#verify-failed")).toBeVisible();
      await expectNoProblems(page);
    });

    test("signed-in header with a long address and the open menu", async ({
      page,
    }) => {
      await page.request.post("/api/test/login", {
        data: {
          email: `a.very.long.address.indeed.${width}@some-long-domain.example.test`,
        },
      });
      await page.goto("/");
      await page.locator("#user-menu-button").click();
      await expect(page.locator("#user-menu-panel")).toBeVisible();
      const box = (await page.locator("#user-menu-panel").boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(width);
      await expectNoProblems(page);
    });

    test("admin page: every tab, and the 403 page", async ({ page }) => {
      await page.request.post("/api/test/login", {
        data: { email: `plain-${width}@example.test`, admin: false },
      });
      await page.goto("/admin");
      await expect(page.locator("#gate-forbidden")).toBeVisible();
      await expectNoProblems(page);
      await page.context().clearCookies();
      await page.request.post("/api/test/login", {
        data: { email: `root-${width}@example.test`, admin: true },
      });
      await page.goto("/admin");
      await expect(page.locator("#admin-days tr").first()).toBeVisible();
      await expectNoProblems(page);
      await page.locator("#admin-days tr").nth(1).locator("button").click();
      await expectNoProblems(page);
      await page.locator("#tab-users").click();
      await expect(page.locator("#admin-users tr").first()).toBeVisible();
      await expectNoProblems(page);
      await page.locator("#tab-backup").click();
      await expectNoProblems(page);
    });

    test("not-found page", async ({ page }) => {
      await page.goto("/no-such-page");
      await expectNoProblems(page);
    });
  });
}
