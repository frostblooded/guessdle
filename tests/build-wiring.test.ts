import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "vitest";

const read = (path: string): string =>
  readFileSync(join(import.meta.dirname, "..", path), "utf8");

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
  it("index.html is the one page: the app shell loading src/main.tsx", () => {
    const html: string = read("index.html");
    assert.ok(html.includes(`"/src/main.tsx"`));
    assert.match(html, /<div id="root"><\/div>/);
    // The API swaps these two for a game's own (src/server/routes/shell.ts)
    assert.match(html, /<title>Guessdle<\/title>\s*<meta\s+name="description"/);
  });

  it("no other HTML page is left in the repo root", () => {
    const pages = readdirSync(join(import.meta.dirname, "..")).filter((f) =>
      f.endsWith(".html"),
    );
    assert.deepEqual(pages, ["index.html"]);
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

  it("prod build hashes asset names and rewrites the shell to match", () => {
    const out = prodBuild();
    const prodHtml: string = readFileSync(join(out, "index.html"), "utf8");
    const refs: string[] = [
      ...prodHtml.matchAll(/"\/dist\/(assets\/[\w-]+-[\w-]{8}\.(?:js|css))"/g),
    ].map((m) => m[1]!);
    assert.ok(refs.some((r) => r.endsWith(".js")));
    assert.ok(refs.some((r) => r.endsWith(".css")));
    for (const ref of refs) {
      assert.ok(existsSync(join(out, ref)), ref);
    }
    assert.ok(!prodHtml.includes('"/src/'));
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

  it("nginx serves the app shell at each app route and as the 404 page", () => {
    const conf: string = read("deploy/nginx.conf");
    assert.match(conf, /location = \/ \{[^}]*try_files \/index\.html =404;/);
    assert.match(
      conf,
      /location ~ \^\/\(login\|verify\|admin\|how-to-play\|create\|my-games\|settings\)\$ \{[^}]*try_files \/index\.html =404;/,
    );
    assert.match(conf, /error_page 404 \/index\.html;/);
    assert.match(conf, /location = \/index\.html \{\s*internal;/);
  });

  it("nginx proxies /g/<slug> to the API for meta injection", () => {
    const conf: string = read("deploy/nginx.conf");
    assert.match(
      conf,
      /location ~ \^\/g\/\[\^\/\]\+\$ \{[^}]*proxy_pass http:\/\/api:3000;/,
    );
  });

  it("nginx serves /g/<slug>/edit from the app shell", () => {
    const conf: string = read("deploy/nginx.conf");
    assert.match(
      conf,
      /location ~ \^\/g\/\[\^\/\]\+\/edit\$ \{[^}]*try_files \/index\.html =404;/,
    );
  });

  it("nginx serves the past days list and archive days from the app shell", () => {
    const conf: string = read("deploy/nginx.conf");
    assert.match(
      conf,
      /location ~ \^\/g\/\[\^\/\]\+\/\(days\|day\/\[0-9\]\+\)\$ \{[^}]*try_files \/index\.html =404;/,
    );
  });

  it("nginx serves /party and /party/<CODE> with the app shell", () => {
    const conf: string = read("deploy/nginx.conf");
    assert.match(
      conf,
      /location ~ \^\/party\(\/\[A-Za-z\]\+\)\?\$ \{[^}]*try_files \/index\.html =404;/,
    );
  });

  it("nginx upgrades party sockets to WebSockets", () => {
    const conf: string = read("deploy/nginx.conf");
    const block =
      /location ~ \^\/api\/parties\/\[\^\/\]\+\/socket\$ \{([^}]*)\}/.exec(
        conf,
      );
    assert.ok(block, "socket location");
    assert.match(block[1]!, /proxy_http_version 1\.1;/);
    assert.match(block[1]!, /proxy_set_header Upgrade \$http_upgrade;/);
    assert.match(block[1]!, /proxy_set_header Connection "upgrade";/);
    assert.match(block[1]!, /proxy_pass http:\/\/api:3000;/);
  });

  it("nginx revalidates by default and caches dist/ forever", () => {
    const conf: string = read("deploy/nginx.conf");
    assert.match(conf, /add_header Cache-Control "no-cache"/);
    assert.match(conf, /location \/dist\/ \{[^}]*max-age=31536000, immutable/);
  });
});
