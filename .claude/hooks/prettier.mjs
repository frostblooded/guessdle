// PostToolUse hook: lint-fix then format the file Claude just edited. Prettier skips .prettierignore'd files.
// Lint errors left after --fix go to stderr with exit 2 so Claude sees them.
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

let input = "";
for await (const chunk of process.stdin) input += chunk;
const file = JSON.parse(input).tool_input?.file_path;
if (!file) process.exit(0);
const bin = (path) => fileURLToPath(new URL(path, import.meta.url));
let lintErrors = "";
if (/\.(ts|mjs)$/.test(file)) {
  const lint = spawnSync(
    process.execPath,
    [
      bin("../../node_modules/eslint/bin/eslint.js"),
      "--fix",
      "--no-warn-ignored",
      file,
    ],
    { encoding: "utf8" },
  );
  if (lint.status !== 0) {
    lintErrors = lint.stdout + lint.stderr;
  }
}
spawnSync(
  process.execPath,
  [
    bin("../../node_modules/prettier/bin/prettier.cjs"),
    "--write",
    "--ignore-unknown",
    file,
  ],
  {
    stdio: "ignore",
  },
);
if (lintErrors) {
  process.stderr.write(lintErrors);
  process.exit(2);
}
