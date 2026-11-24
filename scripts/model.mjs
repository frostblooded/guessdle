// Model-checks the TLA+ specs in tla/ with TLC (npm run model; CI job "model"). Needs Java 11+.
// Downloads tla2tools.jar once into node_modules/.cache and checks its hash.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const VERSION = "1.7.4";
const SHA256 =
  "936a262061c914694dfd669a543be24573c45d5aa0ff20a8b96b23d01e050e88";
const jar = resolve("node_modules", ".cache", `tla2tools-${VERSION}.jar`);

if (!existsSync(jar)) {
  const res = await fetch(
    `https://github.com/tlaplus/tlaplus/releases/download/v${VERSION}/tla2tools.jar`,
  );
  if (!res.ok) {
    throw new Error(`could not download tla2tools.jar: HTTP ${res.status}`);
  }
  mkdirSync(join("node_modules", ".cache"), { recursive: true });
  writeFileSync(jar, Buffer.from(await res.arrayBuffer()));
}
const hash = createHash("sha256").update(readFileSync(jar)).digest("hex");
if (hash !== SHA256) {
  throw new Error(
    `${jar} has sha256 ${hash}, expected ${SHA256}; delete it and retry`,
  );
}

// One run per config: tla/<Spec>-<case>.cfg checks tla/<Spec>.tla
let failed = false;
for (const cfg of readdirSync("tla")
  .filter((f) => f.endsWith(".cfg"))
  .sort()) {
  const spec = `${cfg.split("-")[0]}.tla`;
  const run = spawnSync(
    "java",
    [
      "-XX:+UseParallelGC",
      "-cp",
      jar,
      "tlc2.TLC",
      "-workers",
      "auto",
      "-metadir",
      join(tmpdir(), `tlc-${process.pid}-${cfg}`),
      "-config",
      cfg,
      spec,
    ],
    { cwd: "tla", encoding: "utf8" },
  );
  const out = `${run.stdout}${run.stderr}`;
  const ok = run.status === 0 && out.includes("No error has been found");
  const states = /(\d[\d,]*) distinct states found/.exec(out)?.[1] ?? "?";
  console.log(`${ok ? "ok  " : "FAIL"} ${cfg} (${states} distinct states)`);
  if (!ok) {
    console.log(out);
    failed = true;
  }
}
process.exit(failed ? 1 : 0);
