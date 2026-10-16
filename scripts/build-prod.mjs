// Prod build (ADR 0007): content-hashed bundle names plus an index.html that points at them,
// so a deploy never mixes a stale cached asset with a new page.
// Usage: node scripts/build-prod.mjs [outdir]  (default: dist)
import { build } from "esbuild";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";

const outdir = process.argv[2] ?? "dist";

const { metafile } = await build({
  entryPoints: ["src/script.ts"],
  bundle: true,
  minify: true,
  target: "es2020",
  loader: { ".svg": "file" },
  entryNames: "[name]-[hash]",
  metafile: true,
  outdir,
});

const outputs = Object.keys(metafile.outputs);
const find = (ext) => {
  const found = outputs.filter((o) => o.endsWith(ext));
  if (found.length !== 1)
    throw new Error(`expected one ${ext} output, got ${found}`);
  return basename(found[0]);
};

let html = await readFile("index.html", "utf8");
for (const [dev, hashed] of [
  ["dist/script.js", find(".js")],
  ["dist/script.css", find(".css")],
]) {
  if (!html.includes(`"${dev}"`)) throw new Error(`index.html lacks "${dev}"`);
  html = html.replace(`"${dev}"`, `"dist/${hashed}"`);
}
await mkdir(outdir, { recursive: true });
await writeFile(join(outdir, "index.html"), html);
