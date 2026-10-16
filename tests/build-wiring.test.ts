import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

const read = (path: string): string =>
  readFileSync(join(import.meta.dirname, "..", path), "utf8");

const PAGES: Record<string, string> = {
  "index.html": "gallery",
  "game.html": "script",
  "login.html": "login",
  "verify.html": "verify",
  "admin.html": "admin",
  "how-to-play.html": "how-to-play",
  "create.html": "create",
  "my-games.html": "my-games",
  "edit.html": "edit",
};

describe("build output is wired through the pages and the deploy", () => {
  for (const [page, bundle] of Object.entries(PAGES)) {
    it(`${page} loads the shared stylesheet and dist/${bundle}.js`, () => {
      const html: string = read(page);
      for (const asset of ["styles.css", `${bundle}.js`]) {
        assert.ok(
          html.includes(`"/dist/${asset}"`),
          `/dist/${asset} not referenced in ${page}`,
        );
      }
    });
  }

  it("the 404 page links the shared stylesheet and no script", () => {
    const html: string = read("404.html");
    assert.ok(html.includes('"/dist/styles.css"'));
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

  it("prod build hashes bundle names and rewrites every page to match", () => {
    const out: string = mkdtempSync(join(tmpdir(), "petdle-prod-"));
    execFileSync("node", ["scripts/build-prod.mjs", out], {
      cwd: join(import.meta.dirname, ".."),
    });
    for (const [page, bundle] of Object.entries(PAGES)) {
      const prodHtml: string = readFileSync(join(out, page), "utf8");
      const refs: string[] = [
        ...prodHtml.matchAll(/"\/dist\/([\w-]+-[A-Z0-9]{8}\.(?:js|css))"/g),
      ].map((m) => m[1]!);
      assert.ok(
        refs.some((r) => r.startsWith(`${bundle}-`)),
        page,
      );
      assert.ok(
        refs.some((r) => r.startsWith("styles-")),
        page,
      );
      for (const ref of refs) {
        assert.ok(existsSync(join(out, ref)), ref);
      }
      assert.ok(!prodHtml.includes(`"/dist/${bundle}.js"`), page);
      assert.ok(!prodHtml.includes('"/dist/styles.css"'), page);
    }
    const notFound: string = readFileSync(join(out, "404.html"), "utf8");
    assert.match(notFound, /"\/dist\/styles-[A-Z0-9]{8}\.css"/);
  });

  it("the prod bundle holds no answer or Answer Sequence code, only the grade call", () => {
    const out: string = mkdtempSync(join(tmpdir(), "petdle-prod-"));
    execFileSync("node", ["scripts/build-prod.mjs", out], {
      cwd: join(import.meta.dirname, ".."),
    });
    const js: string = readdirSync(out)
      .filter((f) => f.endsWith(".js"))
      .map((f) => readFileSync(join(out, f), "utf8"))
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

  it("nginx serves /g/<slug> from the game shell", () => {
    const conf: string = read("deploy/nginx.conf");
    assert.match(
      conf,
      /location ~ \^\/g\/\[\^\/\]\+\$ \{[^}]*try_files \/game\.html =404;/,
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
