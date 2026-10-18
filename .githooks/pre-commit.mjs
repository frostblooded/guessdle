// Lints and format-checks the staged files, so edits made outside Claude's Edit/Write hook (sed, scripts, your editor) are caught too.
// Checks the working-tree copy of each staged file; skip once with `git commit --no-verify`.
import { execFileSync, spawnSync } from "node:child_process";

const staged = execFileSync(
  "git",
  ["diff", "--cached", "--name-only", "--diff-filter=ACMR", "-z"],
  { encoding: "utf8" },
)
  .split("\0")
  .filter(Boolean);
const run = (bin, args) =>
  spawnSync(process.execPath, [bin, ...args], { stdio: "inherit" }).status;

const code = staged.filter((f) => /\.(tsx?|mjs)$/.test(f));
let failed = false;
if (code.length) {
  failed ||=
    run("node_modules/eslint/bin/eslint.js", ["--no-warn-ignored", ...code]) !==
    0;
}
if (staged.length) {
  failed ||=
    run("node_modules/prettier/bin/prettier.cjs", [
      "--check",
      "--ignore-unknown",
      ...staged,
    ]) !== 0;
}
if (failed) {
  process.stderr.write(
    "pre-commit: fix the problems above (npx eslint --fix <file>, npx prettier --write <file>), then git add and commit again.\n",
  );
  process.exit(1);
}
