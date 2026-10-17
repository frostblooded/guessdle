import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "vitest";

const read = (path: string): string =>
  readFileSync(join(import.meta.dirname, "..", path), "utf8");

// Each page and the entry module it loads (Vite rewrites both into dist/ on build)
const PAGES: Record<string, string> = {
  "index.html": "src/pages/gallery.ts",
  "game.html": "src/script.ts",
  "login.html": "src/pages/login.ts",
  "verify.html": "src/pages/verify.ts",
  "admin.html": "src/pages/admin.ts",
  "how-to-play.html": "src/pages/how-to-play.ts",
  "create.html": "src/pages/create.ts",
  "my-games.html": "src/pages/my-games.ts",
  "edit.html": "src/pages/edit.ts",
};

// One prod build into a temp folder, shared by the tests that read its output
let prodOut: string | undefined;
function prodBuild(): string {
  if (prodOut === undefined) {
    prodOut = mkdtempSync(join(tmpdir(), "petdle-prod-"));
    execFileSync(
      process.execPath,
      [
        "node_modules/vite/bin/vite.js",
        "build",
        "--outDir",
        prodOut,
        "--emptyOutDir",
        "--logLevel",
        "error",
      ],
      { cwd: join(import.meta.dirname, "..") },
    );
  }
  return prodOut;
}

describe("build output is wired through the pages and the deploy", () => {
  for (const [page, entry] of Object.entries(PAGES)) {
    it(`${page} loads the shared stylesheet and ${entry}`, () => {
      const html: string = read(page);
      for (const asset of ["src/styles.css", entry]) {
        assert.ok(
          html.includes(`"/${asset}"`),
          `/${asset} not referenced in ${page}`,
        );
      }
    });
  }

  it("vite builds every page", () => {
    const config: string = read("vite.config.ts");
    for (const page of [...Object.keys(PAGES), "404.html"]) {
      assert.ok(config.includes(`"${page.replace(".html", "")}"`), page);
    }
  });

  it("the 404 page links the shared stylesheet and no script", () => {
    const html: string = read("404.html");
    assert.ok(html.includes('"/src/styles.css"'));
    assert.ok(!html.includes("<script src"));
    assert.ok(!html.includes('type="module"'));
  });

  it("the header and footer are rendered by the shell, not repeated per page", () => {
    for (const page of Object.keys(PAGES)) {
      const html: string = read(page);
      assert.match(html, /<header id="site-header"[^>]*><\/header>/, page);
      assert.match(html, /<footer id="site-footer"[^>]*><\/footer>/, page);
      assert.match(html, /<main id="main"/, page);
    }
  });

  it("Pages serves redirect.html as index and 404, all to one URL", () => {
    const deploy: string = read(".github/workflows/deploy.yml");
    assert.match(deploy, /cp deploy\/redirect\.html _site\/index\.html/);
    assert.match(deploy, /cp deploy\/redirect\.html _site\/404\.html/);
    const redirect: string = read("deploy/redirect.html");
    const urls: string[] = [
      ...redirect.matchAll(/https:\/\/guessdle\.niki\.casa\//g),
    ].map((m) => m[0]);
    assert.equal(urls.length, 3, "meta refresh, location.replace, link");
    assert.match(redirect, /http-equiv="refresh"[^>]*url=https:/);
    assert.match(redirect, /location\.replace\("https:/);
    assert.match(redirect, /<a href="https:/);
  });

  it("dist is gitignored", () => {
    assert.ok(read(".gitignore").split(/\r?\n/).includes("/dist"));
  });

  it("prod build hashes asset names and rewrites every page to match", () => {
    const out = prodBuild();
    for (const page of Object.keys(PAGES)) {
      const prodHtml: string = readFileSync(join(out, page), "utf8");
      const refs: string[] = [
        ...prodHtml.matchAll(
          /"\/dist\/(assets\/[\w-]+-[\w-]{8}\.(?:js|css))"/g,
        ),
      ].map((m) => m[1]!);
      assert.ok(
        refs.some((r) => r.endsWith(".js")),
        page,
      );
      assert.ok(
        refs.some((r) => r.startsWith("assets/styles-")),
        page,
      );
      for (const ref of refs) {
        assert.ok(existsSync(join(out, ref)), ref);
      }
      assert.ok(!prodHtml.includes('"/src/'), page);
    }
    const notFound: string = readFileSync(join(out, "404.html"), "utf8");
    assert.match(notFound, /"\/dist\/assets\/styles-[\w-]{8}\.css"/);
  });

  it("the prod bundle holds no answer or Answer Sequence code, only the grade call", () => {
    const assets = join(prodBuild(), "assets");
    const js: string = readdirSync(assets)
      .filter((f) => f.endsWith(".js"))
      .map((f) => readFileSync(join(assets, f), "utf8"))
      .join("");
    assert.match(js, /[/]grade/);
    assert.ok(!js.includes("seedrandom"), "seeded random is not bundled");
    assert.ok(!js.includes("2026-10-16"), "no backfilled answers");
    assert.ok(!js.includes("daily_answers"));
  });

  it("nginx serves the clean page URLs from the HTML files", () => {
    const conf: string = read("deploy/nginx.conf");
    assert.match(
      conf,
      /location \/ \{[^}]*try_files \$uri \$uri\/index\.html \$uri\.html =404;/,
    );
  });

  it("nginx proxies /g/<slug> to the API for meta injection", () => {
    const conf: string = read("deploy/nginx.conf");
    assert.match(
      conf,
      /location ~ \^\/g\/\[\^\/\]\+\$ \{[^}]*proxy_pass http:\/\/api:3000;/,
    );
  });

  it("nginx serves /g/<slug>/edit from the editor shell", () => {
    const conf: string = read("deploy/nginx.conf");
    assert.match(
      conf,
      /location ~ \^\/g\/\[\^\/\]\+\/edit\$ \{[^}]*try_files \/edit\.html =404;/,
    );
  });

  it("nginx revalidates by default and caches dist/ forever", () => {
    const conf: string = read("deploy/nginx.conf");
    assert.match(conf, /add_header Cache-Control "no-cache"/);
    assert.match(conf, /location \/dist\/ \{[^}]*max-age=31536000, immutable/);
  });
});
