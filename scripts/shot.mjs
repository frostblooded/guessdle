// Screenshots (and optionally videos) of app pages on a phone and a desktop, in light and dark,
// with the runtime problems each page showed. The one driver agents use to see the UI
// (skill: .claude/skills/see-ui). Run `node scripts/shot.mjs --help` for the options.
import { spawn } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { chromium } from "@playwright/test";

const HELP = `Usage: node scripts/shot.mjs [options] <path> [<path> ...]

  <path>             a page path, e.g. / /g/petdle /how-to-play ("@game" is a fresh game of the
                     signed-in player, e.g. @game/edit)
  --as <who>         guest (default), player or admin; player and admin are fresh test accounts
  --sizes <list>     phone,desktop (default both); also tablet, or WxH like 390x844
  --themes <list>    light,dark (default both)
  --click <sel>      click this selector after load, before the shot (repeatable, in order)
  --full             full-page screenshot instead of the first screen
  --video            also record a .webm of each page loading and the clicks
  --out <dir>        where to write (default shots/, gitignored)
  --base <url>       use a running server (npm start or the e2e server) instead of starting one

Without --base it starts tests/e2e/serve.ts (Docker Postgres, test sign-in) on port 8090 and
stops it after. Run npm run build first: the server serves dist/. Exits 1 if any page logged a
page error, a console error or a 5xx, or scrolled sideways.`;

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    as: { type: "string", default: "guest" },
    sizes: { type: "string", default: "phone,desktop" },
    themes: { type: "string", default: "light,dark" },
    click: { type: "string", multiple: true, default: [] },
    full: { type: "boolean", default: false },
    video: { type: "boolean", default: false },
    out: { type: "string", default: "shots" },
    base: { type: "string" },
    help: { type: "boolean", default: false },
  },
});
if (values.help || positionals.length === 0) {
  console.log(HELP);
  process.exit(values.help ? 0 : 1);
}

const SIZES = {
  phone: { width: 320, height: 568, isMobile: true },
  tablet: { width: 768, height: 1024, isMobile: true },
  desktop: { width: 1280, height: 800, isMobile: false },
};
const sizeOf = (name) => {
  if (SIZES[name]) return SIZES[name];
  const m = /^(\d+)x(\d+)$/.exec(name);
  if (!m) throw new Error(`unknown size ${name}`);
  return { width: Number(m[1]), height: Number(m[2]), isMobile: false };
};
const sizes = values.sizes.split(",").map((s) => [s, sizeOf(s)]);
const themes = values.themes.split(",");
const out = resolve(values.out);
mkdirSync(out, { recursive: true });

async function up(url) {
  try {
    return (await fetch(url)).status < 500;
  } catch {
    return false;
  }
}

let server;
let base = values.base;
if (base === undefined) {
  if (!existsSync("dist/index.html")) {
    console.error("dist/ is missing: run npm run build first.");
    process.exit(1);
  }
  base = "http://127.0.0.1:8090";
  if (!(await up(base))) {
    server = spawn(process.execPath, ["tests/e2e/serve.ts"], {
      env: { ...process.env, PORT: "8090" },
      stdio: ["ignore", "ignore", "inherit"],
    });
    for (let i = 0; i < 180 && !(await up(base)); i++) {
      await new Promise((r) => setTimeout(r, 1000));
    }
    if (!(await up(base))) {
      server.kill();
      console.error("the server did not start in 3 minutes (is Docker up?)");
      process.exit(1);
    }
  }
}

const browser = await chromium.launch(
  process.env.PW_CHROMIUM_PATH
    ? { executablePath: process.env.PW_CHROMIUM_PATH }
    : {},
);
const tag = Date.now().toString(36);
let failed = false;
try {
  // One account (and game) for the whole run, so every shot shows the same data
  const setup = await browser.newContext({ baseURL: base });
  let game = null;
  if (values.as !== "guest") {
    const login = await setup.request.post("/api/test/login", {
      data: {
        email: `shot-${values.as}-${tag}@example.test`,
        name: `Shot ${values.as}`,
        admin: values.as === "admin",
      },
    });
    if (!login.ok()) {
      throw new Error(
        `test sign-in failed (${login.status()}): --as needs the e2e server (no --base, or NODE_ENV=test)`,
      );
    }
    if (positionals.some((p) => p.startsWith("@game"))) {
      game = (
        await (
          await setup.request.post("/api/games", {
            data: { name: `Shot game ${tag}` },
          })
        ).json()
      ).slug;
    }
  }
  const state = await setup.storageState();
  await setup.close();

  for (const raw of positionals) {
    const path = raw.replace(/^@game/, `/g/${game}`);
    for (const [sizeName, size] of sizes) {
      for (const theme of themes) {
        const name = `${path.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "home"}-${sizeName}-${theme}`;
        const context = await browser.newContext({
          baseURL: base,
          storageState: state,
          viewport: { width: size.width, height: size.height },
          isMobile: size.isMobile,
          hasTouch: size.isMobile,
          deviceScaleFactor: 2,
          ...(values.video
            ? {
                recordVideo: {
                  dir: out,
                  size: { width: size.width, height: size.height },
                },
              }
            : {}),
        });
        await context.addInitScript((t) => {
          try {
            localStorage.setItem("theme", t);
          } catch {
            // storage blocked: the page keeps its default theme
          }
        }, theme);
        const page = await context.newPage();
        const problems = [];
        page.on("pageerror", (e) => problems.push(`page error: ${e.message}`));
        page.on("console", (m) => {
          if (m.type() === "error" && !/status of 4\d\d/.test(m.text())) {
            problems.push(`console error: ${m.text()}`);
          }
        });
        page.on("response", (r) => {
          if (r.status() >= 500) problems.push(`HTTP ${r.status()} ${r.url()}`);
        });
        await page.goto(path);
        await page.waitForLoadState("networkidle").catch(() => {});
        await page
          .locator("#loading-state")
          .waitFor({ state: "hidden", timeout: 5000 })
          .catch(() => {});
        for (const selector of values.click) {
          await page.locator(selector).first().click({ timeout: 5000 });
          await page.waitForLoadState("networkidle").catch(() => {});
        }
        const [scroll, client] = await page.evaluate(() => [
          document.documentElement.scrollWidth,
          document.documentElement.clientWidth,
        ]);
        if (scroll > client + 1) {
          problems.push(`scrolls sideways: ${scroll}px wide in ${client}px`);
        }
        const file = join(out, `${name}.png`);
        await page.screenshot({ path: file, fullPage: values.full });
        const video = page.video();
        await context.close();
        console.log(`${problems.length ? "PROBLEM" : "ok     "} ${file}`);
        if (video) console.log(`        ${await video.path()}`);
        for (const p of problems) console.log(`        ${p}`);
        failed ||= problems.length > 0;
      }
    }
  }
} finally {
  await browser.close();
  server?.kill();
}
process.exit(failed ? 1 : 0);
