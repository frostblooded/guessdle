#!/usr/bin/env node
// Fills the cached picker app (assets/picker.html) with the list to read.
// Usage: node build.mjs --list "List of Pixar films" [--wiki en] [--from auto|tables|<n>|bullets] --out picker.html
import { readFileSync, writeFileSync } from "node:fs";
import { parseArgs } from "node:util";

const { values } = parseArgs({
  options: {
    list: { type: "string" },
    wiki: { type: "string", default: "en" },
    from: { type: "string", default: "auto" },
    out: { type: "string" },
  },
});
if (!values.list || !values.out) {
  console.error('Usage: node build.mjs --list "List of Pixar films" [--wiki en] [--from auto|tables|<n>|bullets] --out picker.html');
  process.exit(2);
}
const config = { list: values.list, wiki: values.wiki, from: values.from };
const name = values.list.replace(/^List of /i, "").replace(/[<&]/g, "");
const template = readFileSync(new URL("../assets/picker.html", import.meta.url), "utf8");
const html = template
  .replace("<title>Game Data Picker</title>", `<title>${name} picker</title>`)
  .replace('/*CONFIG*/ { list: "", wiki: "en", from: "auto" }', () => JSON.stringify(config).replace(/</g, "\\u003c"));
writeFileSync(values.out, html);
console.error(`Wrote ${values.out} for "${values.list}" on ${values.wiki}.wikipedia.org`);
