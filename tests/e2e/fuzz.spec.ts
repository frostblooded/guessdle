import { expect, test, type Page } from "@playwright/test";

// A seeded monkey: it clicks, types and navigates at random like a careless player and checks after
// every step that nothing broke. Replay a failure with the seed and step count it prints:
//   FUZZ_SEED=123 FUZZ_STEPS=80 npm run test:e2e -- fuzz.spec.ts
// The nightly fuzz workflow runs it with random seeds and more steps.

const STEPS = Number(process.env["FUZZ_STEPS"] ?? 40);
const SEED = process.env["FUZZ_SEED"];

// mulberry32: small, fast and the same in every Node version
function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const TEXTS: readonly string[] = [
  "",
  "a",
  "Ati",
  "Cookie",
  "Eddie",
  "  spaced  ",
  "<script>alert(1)</script>",
  "' OR 1=1 --",
  "ÄÖÜ ñ 漢字 🐶",
  "x".repeat(300),
  "-1",
  "0",
  "3.14",
  "1e309",
  "NaN",
  "ABCD",
  "fuzz@example.test",
];

const PATHS: readonly string[] = [
  "/",
  "/how-to-play",
  "/login",
  "/create",
  "/my-games",
  "/settings",
  "/friends",
  "/profile",
  "/party",
  "/party/ZZZZ",
  "/g/petdle",
  "/g/petdle/days",
  "/g/petdle/day/0",
  "/g/petdle/day/99999",
  "/g/petdle/edit",
  "/g/no-such-game",
  "/u/nobody",
  "/p/999999",
  "/no/such/page",
];

interface Target {
  id: number;
  kind: "click" | "type" | "select";
  label: string;
}

// Marks every visible, enabled control that stays on the site and returns what can be done with it
const targets = (page: Page): Promise<Target[]> =>
  page.evaluate(() => {
    const out: Target[] = [];
    const nodes = document.querySelectorAll<HTMLElement>(
      "a[href], button, input, textarea, select, [role=tab], [role=option], [role=menuitem], [role=switch], [role=checkbox], [role=combobox]",
    );
    nodes.forEach((el, i) => {
      const style = getComputedStyle(el);
      const box = el.getBoundingClientRect();
      if (
        box.width === 0 ||
        box.height === 0 ||
        style.visibility === "hidden" ||
        (el as HTMLButtonElement).disabled ||
        el.closest("[inert], [aria-hidden=true]") !== null
      ) {
        return;
      }
      if (el instanceof HTMLAnchorElement) {
        const url = new URL(el.href, location.href);
        if (
          url.origin !== location.origin ||
          el.target === "_blank" ||
          el.hasAttribute("download") ||
          url.pathname.startsWith("/api/")
        ) {
          return;
        }
      }
      if (el instanceof HTMLInputElement && el.type === "file") {
        return;
      }
      el.dataset["fuzzId"] = String(i);
      const typing =
        el instanceof HTMLTextAreaElement ||
        (el instanceof HTMLInputElement &&
          !["checkbox", "radio", "submit", "button", "range", "color"].includes(
            el.type,
          ));
      out.push({
        id: i,
        kind:
          el instanceof HTMLSelectElement
            ? "select"
            : typing
              ? "type"
              : "click",
        label: `${el.tagName.toLowerCase()} "${(el.getAttribute("aria-label") ?? el.textContent ?? "").trim().slice(0, 40)}"`,
      });
    });
    return out;
  });

interface Run {
  name: string;
  seed: number;
  signedIn: boolean;
  viewport?: { width: number; height: number };
}

const base = SEED === undefined ? 0 : Number(SEED);
const RUNS: readonly Run[] = [
  { name: "a guest on a desktop", seed: base + 1, signedIn: false },
  { name: "a signed-in player on a desktop", seed: base + 2, signedIn: true },
  {
    name: "a guest on a 320px phone",
    seed: base + 4,
    signedIn: false,
    viewport: { width: 320, height: 568 },
  },
  {
    name: "a signed-in player on a 320px phone",
    seed: base + 3,
    signedIn: true,
    viewport: { width: 320, height: 568 },
  },
];

// Console noise that is not a bug: the browser's own line for a 4xx it fetched (the shell's
// 404 for an unknown game, a refused request) and a closed party socket
const HARMLESS: readonly RegExp[] = [
  /Failed to load resource: the server responded with a status of 4\d\d/,
  /WebSocket connection to .* failed/,
];

for (const run of RUNS) {
  test(`fuzzing as ${run.name} breaks nothing (seed ${run.seed}, ${STEPS} steps)`, async ({
    page,
  }) => {
    test.setTimeout(60_000 + STEPS * 3_000);
    if (run.viewport) {
      await page.setViewportSize(run.viewport);
    }
    const random = prng(run.seed);
    const pick = <T>(items: readonly T[]): T =>
      items[Math.floor(random() * items.length)]!;
    const log: string[] = [];
    const problems: string[] = [];

    page.on("pageerror", (err) => problems.push(`page error: ${err.message}`));
    page.on("console", (msg) => {
      if (
        msg.type() === "error" &&
        !HARMLESS.some((re) => re.test(msg.text()))
      ) {
        problems.push(`console error: ${msg.text()}`);
      }
    });
    page.on("response", (res) => {
      if (res.status() >= 500) {
        problems.push(
          `HTTP ${res.status()} from ${res.request().method()} ${res.url()}`,
        );
      }
    });
    page.on("dialog", (dialog) => {
      void (random() < 0.5 ? dialog.accept("fuzz") : dialog.dismiss());
    });
    // Stay on the site: anything that would leave it is answered empty
    await page.route(
      (url) => !["127.0.0.1", "localhost"].includes(url.hostname),
      (route) => route.fulfill({ status: 204, body: "" }),
    );

    if (run.signedIn) {
      const email = `fuzz-${run.seed}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}@example.test`;
      await page.request.post("/api/test/login", { data: { email } });
      // A game of their own, so the editor has something to break
      await page.request.post("/api/games", {
        data: { name: `Fuzz ${run.seed} ${Date.now()}` },
      });
    }
    await page.goto("/");

    const settle = async (): Promise<void> => {
      await page
        .waitForLoadState("networkidle", { timeout: 2_000 })
        .catch(() => undefined);
    };
    const check = async (step: number): Promise<void> => {
      const read = () =>
        page.evaluate(() => ({
          root: document.getElementById("root")?.childElementCount ?? 0,
          scroll: document.documentElement.scrollWidth,
          width: document.documentElement.clientWidth,
        }));
      // A full page load (sign-in detour, location.replace) can start mid-read: read it again once loaded
      const state = await read().catch(async () => {
        await page.waitForLoadState("load");
        await settle();
        return read();
      });
      // A page that just loaded renders a moment later; one that stays empty has crashed
      if (
        state.root === 0 &&
        !(await page
          .waitForFunction(
            () => (document.getElementById("root")?.childElementCount ?? 0) > 0,
            undefined,
            { timeout: 5_000 },
          )
          .then(() => true)
          .catch(() => false))
      ) {
        problems.push("the app rendered nothing (blank #root)");
      }
      if (run.viewport && state.scroll > state.width + 1) {
        problems.push(
          `the page scrolls sideways (${state.scroll}px wide in ${state.width}px) at ${new URL(page.url()).pathname}`,
        );
      }
      expect(
        problems,
        `seed ${run.seed}, step ${step}, replay with FUZZ_SEED=${base} FUZZ_STEPS=${step}\n${log.join("\n")}`,
      ).toEqual([]);
    };

    for (let step = 1; step <= STEPS; step++) {
      const roll = random();
      const where = new URL(page.url()).pathname;
      try {
        if (roll < 0.08) {
          const path = pick(PATHS);
          log.push(`${step}. goto ${path}`);
          await page.goto(path);
        } else if (roll < 0.11) {
          log.push(`${step}. back from ${where}`);
          await page.goBack().catch(() => undefined);
        } else if (roll < 0.2) {
          const key = pick(["Escape", "Enter", "Tab", "ArrowDown", "ArrowUp"]);
          log.push(`${step}. press ${key} on ${where}`);
          await page.keyboard.press(key);
        } else {
          const found = await targets(page);
          if (found.length === 0) {
            log.push(`${step}. nothing to do on ${where}`);
            continue;
          }
          const target = pick(found);
          const el = page.locator(`[data-fuzz-id="${target.id}"]`).first();
          if (target.kind === "type") {
            const text = pick(TEXTS);
            log.push(
              `${step}. type ${JSON.stringify(text.slice(0, 30))} into ${target.label} on ${where}`,
            );
            await el.fill(text, { timeout: 2_000 });
            if (random() < 0.4) {
              await el.press("Enter", { timeout: 2_000 });
            }
          } else if (target.kind === "select") {
            const options = await el.locator("option").count();
            log.push(`${step}. select in ${target.label} on ${where}`);
            if (options > 0) {
              await el.selectOption(
                { index: Math.floor(random() * options) },
                { timeout: 2_000 },
              );
            }
          } else {
            log.push(`${step}. click ${target.label} on ${where}`);
            await el.click({ timeout: 2_000 });
          }
        }
      } catch (err) {
        // A control that moved, closed or got covered before the action is not a bug
        log.push(`   (skipped: ${(err as Error).message.split("\n")[0]})`);
      }
      await settle();
      await check(step);
    }
  });
}
