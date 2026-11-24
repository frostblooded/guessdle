#!/usr/bin/env node
// Fills the cached picker app (assets/picker.html) with one gather.mjs result.
// Usage: node build.mjs data.json picker.html
import { readFileSync, writeFileSync } from "node:fs";

const [dataPath, outPath] = process.argv.slice(2);
if (!dataPath || !outPath) {
  console.error("Usage: node build.mjs data.json picker.html");
  process.exit(2);
}
const data = JSON.parse(readFileSync(dataPath, "utf8"));
if (!Array.isArray(data.rows) || data.rows.length === 0) {
  console.error(`${dataPath} has no rows; nothing to pick from.`);
  process.exit(1);
}
const template = readFileSync(new URL("../assets/picker.html", import.meta.url), "utf8");
const json = JSON.stringify(data).replace(/</g, "\\u003c");
const html = template
  .replace("<title>Game Data Picker</title>", `<title>${data.list.replace(/^List of /i, "").replace(/[<&]/g, "")} picker</title>`)
  .replace("/*DATA*/null", () => json);
writeFileSync(outPath, html);
console.error(`Wrote ${outPath} (${data.rows.length} rows, ${(html.length / 1e6).toFixed(1)} MB)`);
