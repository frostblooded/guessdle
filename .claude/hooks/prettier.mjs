// PostToolUse hook: format the file Claude just edited. Prettier skips .prettierignore'd files.
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

let input = "";
for await (const chunk of process.stdin) input += chunk;
const file = JSON.parse(input).tool_input?.file_path;
if (!file) process.exit(0);
const bin = fileURLToPath(
  new URL("../../node_modules/prettier/bin/prettier.cjs", import.meta.url),
);
spawnSync(process.execPath, [bin, "--write", "--ignore-unknown", file], {
  stdio: "ignore",
});
