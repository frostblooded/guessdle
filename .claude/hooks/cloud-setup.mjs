// SessionStart hook: makes a Claude Code cloud container able to run `npm run check`.
// Does nothing elsewhere (CLAUDE_CODE_REMOTE is set only in cloud sessions).
// Node from .nvmrc, npm ci, dockerd, Docker Hub images through mirror.gcr.io (Hub answers 429),
// and the sandbox's Chromium for Playwright (the matching build cannot be downloaded).
import { execFileSync, spawn, spawnSync } from "node:child_process";
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
} from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

if (process.env.CLAUDE_CODE_REMOTE !== "true") process.exit(0);

process.chdir(fileURLToPath(new URL("../..", import.meta.url)));
const log = (msg) => process.stderr.write(`cloud-setup: ${msg}\n`);
const ok = (cmd, args) =>
  spawnSync(cmd, args, { stdio: "ignore" }).status === 0;
const env = [];

// Node from .nvmrc (the image ships an older one)
const major = readFileSync(".nvmrc", "utf8").trim();
let nodeBin = "";
if (!process.version.startsWith(`v${major}.`)) {
  const dir = join(homedir(), ".local", `node-v${major}`);
  if (!existsSync(join(dir, "bin", "node"))) {
    const index = await (
      await fetch("https://nodejs.org/dist/index.json")
    ).json();
    const version = index.find((r) =>
      r.version.startsWith(`v${major}.`),
    ).version;
    log(`installing Node ${version}`);
    mkdirSync(dir, { recursive: true });
    execFileSync("sh", [
      "-c",
      `curl -fsSL https://nodejs.org/dist/${version}/node-${version}-linux-x64.tar.xz | tar -xJ -C "${dir}" --strip-components=1`,
    ]);
  }
  nodeBin = join(dir, "bin");
  env.push(`export PATH="${nodeBin}:$PATH"`);
}
const PATH = nodeBin ? `${nodeBin}:${process.env.PATH}` : process.env.PATH;

// npm ci when node_modules is missing or older than the lockfile
const stale =
  !existsSync("node_modules/.package-lock.json") ||
  statSync("node_modules/.package-lock.json").mtimeMs <
    statSync("package-lock.json").mtimeMs;
if (stale) {
  log("npm ci");
  execFileSync("npm", ["ci", "--no-audit", "--no-fund"], {
    stdio: ["ignore", "ignore", "inherit"],
    env: { ...process.env, PATH },
  });
}

// dockerd is installed but not started
if (!ok("docker", ["info"])) {
  log("starting dockerd");
  spawn("dockerd", [], { detached: true, stdio: "ignore" }).unref();
  for (let i = 0; i < 60 && !ok("docker", ["info"]); i++)
    await new Promise((r) => setTimeout(r, 500));
}

// Testcontainers images, pulled from the mirror and tagged with the names the tests use
for (const [image, mirror] of [
  ["postgres:17-alpine", "mirror.gcr.io/library/postgres:17-alpine"],
  ["axllent/mailpit:latest", "mirror.gcr.io/axllent/mailpit:latest"],
]) {
  if (
    !ok("docker", ["image", "inspect", image]) &&
    ok("docker", ["pull", "-q", mirror])
  ) {
    ok("docker", ["tag", mirror, image]);
  }
}

// Ryuk (the reaper) is another Docker Hub image; the container is thrown away anyway.
// The backup image build needs Docker Hub and Alpine's package mirror, both blocked here.
// PW_CHROMIUM_PATH: tests/e2e/playwright.config.ts launches it instead of Playwright's own build.
env.push(
  "export TESTCONTAINERS_RYUK_DISABLED=true",
  "export SKIP_BACKUP_IMAGE_TEST=1",
  "export PW_CHROMIUM_PATH=/opt/pw-browsers/chromium",
);
if (process.env.CLAUDE_ENV_FILE)
  appendFileSync(process.env.CLAUDE_ENV_FILE, env.join("\n") + "\n");
log("ready");
