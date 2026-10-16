// Prod build (ADR 0007): content-hashed bundle names plus the HTML pages rewritten to point at them,
// so a deploy never mixes a stale cached asset with a new page.
// Usage: node scripts/build-prod.mjs [outdir]  (default: dist)
import { build } from "esbuild";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { COMMON_OPTIONS } from "./entries.mjs";

const outdir = process.argv[2] ?? "dist";

const { metafile } = await build({
  ...COMMON_OPTIONS,
  minify: true,
  entryNames: "[name]-[hash]",
  metafile: true,
  outdir,
});

// "script-AB12CD34.js" -> ["script.js", "script-AB12CD34.js"]
const renames = Object.keys(metafile.outputs)
  .map((out) => basename(out))
  .flatMap((file) => {
    const match = /^(.+)-[A-Z0-9]{8}\.(js|css)$/.exec(file);
    return match ? [[`${match[1]}.${match[2]}`, file]] : [];
  });

await mkdir(outdir, { recursive: true });
const pages = (await readdir(".")).filter((file) => file.endsWith(".html"));
for (const page of pages) {
  let html = await readFile(page, "utf8");
  for (const [dev, hashed] of renames) {
    html = html.replaceAll(`"/dist/${dev}"`, `"/dist/${hashed}"`);
  }
  await writeFile(join(outdir, page), html);
}
