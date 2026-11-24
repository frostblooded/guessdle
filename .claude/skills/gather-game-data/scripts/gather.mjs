#!/usr/bin/env node
// Reads a Wikipedia list page, then the infobox of every page it links to, and writes
// data.json for build.mjs. Every value is copied from the infobox as Wikipedia renders it.
// Usage: node gather.mjs --list "List of Pixar films" [--wiki en] [--from tables|bullets]
//        [--tables 1] [--limit 300] [--out data.json]
//        node gather.mjs --refresh data.json   (downloads previews that failed last time)
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { JSDOM } from "jsdom";
import sharp from "sharp";

const { values: args } = parseArgs({
  options: {
    list: { type: "string" },
    wiki: { type: "string", default: "en" },
    from: { type: "string", default: "auto" },
    tables: { type: "string", default: "all" },
    limit: { type: "string", default: "300" },
    out: { type: "string", default: "data.json" },
    refresh: { type: "string" },
  },
});
if (!args.list && !args.refresh) {
  console.error('Usage: node gather.mjs --list "List of Pixar films"');
  process.exit(2);
}

const UA = "GuessdleDataPicker/1.0 (https://github.com/frostblooded/guessdle)";
const WIKI = `https://${args.wiki}.wikipedia.org`;
const IMPORT_WIDTH = 500;
const PREVIEW_WIDTH = 320;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const titleOf = (raw) =>
  decodeURIComponent(
    raw.replace(/^https?:\/\/[^/]+\/wiki\//, "").replace(/^\.\//, "").split("#")[0],
  ).replace(/_/g, " ");

async function get(url, binary = false) {
  for (let attempt = 0; attempt < 8; attempt++) {
    let out;
    try {
      out = execFileSync(
        "curl",
        ["-sS", "-L", "-m", "40", "-A", UA, "-w", "\n%{http_code}", url],
        { maxBuffer: 128e6, stdio: ["ignore", "pipe", "ignore"] },
      );
    } catch {
      out = Buffer.alloc(0);
    }
    const cut = out.lastIndexOf("\n");
    const code = cut < 0 ? "" : out.subarray(cut + 1).toString();
    if (code === "200") {
      const body = out.subarray(0, cut);
      return binary ? body : body.toString("utf8");
    }
    if (code === "404") {
      return null;
    }
    await sleep(1500 * (attempt + 1));
  }
  return null;
}

const parse = (html) => new JSDOM(html).window.document;
const all = (el, selector) => [...el.querySelectorAll(selector)];

const page = async (title) => {
  const html = await get(
    `${WIKI}/api/rest_v1/page/html/${encodeURIComponent(title.replace(/ /g, "_"))}?redirect=true`,
  );
  return html === null ? null : parse(html);
};

const clean = (s) =>
  s
    .replace(/\[(\d+|[a-z]|note \d+|citation needed|nb \d+)\]/gi, "")
    .replace(/\s+/g, " ")
    .trim();

function valueOf(td) {
  all(
    td,
    "sup, style, script, .reference, .mw-ref, .noprint, .sortkey, [style*='display:none'], [style*='display: none']",
  ).forEach((n) => n.remove());
  const items = all(td, "li").map((li) => clean(li.textContent)).filter(Boolean);
  if (items.length > 1) {
    return items;
  }
  const lines = td.innerHTML
    .split(/<br\s*\/?>/i)
    .map((h) => clean(parse(h).body.textContent))
    .filter(Boolean);
  return lines.length > 1 ? lines : clean(td.textContent);
}

function linksFrom(doc) {
  const content = doc.querySelector("body") ?? doc;
  const linkIn = (el) =>
    all(el, "a[rel='mw:WikiLink']")
      .map((a) => titleOf(a.getAttribute("href") ?? ""))
      .find((t) => t && !t.includes(":"));
  const fromTables = () => {
    const tables = all(content, "table.wikitable");
    const picked =
      args.tables === "all"
        ? tables
        : args.tables.split(",").map((n) => tables[Number(n) - 1]).filter(Boolean);
    return picked.flatMap((t) =>
      all(t, "tr").map((tr) => {
        const head = tr.querySelector("th[scope=row]");
        return (head && linkIn(head)) || linkIn(tr);
      }),
    );
  };
  const fromBullets = () =>
    all(content, "section > ul > li, section > div > ul > li, section > ol > li")
      .filter((li) => !li.closest(".navbox, .reflist, .refbegin, .hatnote, .sidebar"))
      .map((li) => linkIn(li));
  const titles =
    args.from === "bullets"
      ? fromBullets()
      : args.from === "tables"
        ? fromTables()
        : fromTables().filter(Boolean).length > 0
          ? fromTables()
          : fromBullets();
  return [...new Set(titles.filter(Boolean))];
}

function imageUrls(raw, width) {
  const src = (raw.startsWith("//") ? `https:${raw}` : raw).split("?")[0].replace(
    /^https:\/\/thumb\.wikimedia\.org\//,
    "https://upload.wikimedia.org/",
  );
  const thumb = /^(.*)\/thumb\/(.+?)\/\d+px-[^/]+$/.exec(src);
  const original = thumb ? `${thumb[1]}/${thumb[2]}` : src;
  const file = original.slice(original.lastIndexOf("/") + 1);
  const base = thumb ? `${thumb[1]}/thumb/${thumb[2]}` : null;
  const forImport = /\.svg$/i.test(file)
    ? base && `${base}/${IMPORT_WIDTH}px-${file}.png`
    : !/\.(jpe?g|png|webp)$/i.test(file)
      ? null
      : base && width > IMPORT_WIDTH
        ? `${base}/${IMPORT_WIDTH}px-${file}`
        : original;
  return { preview: src, import: forImport };
}

async function pageImage(title, box) {
  const summary = await get(
    `${WIKI}/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, "_"))}`,
  );
  const lead = summary && JSON.parse(summary);
  if (lead?.originalimage) {
    return imageUrls(
      lead.thumbnail?.source ?? lead.originalimage.source,
      lead.originalimage.width,
    );
  }
  const img = box.querySelector("img");
  return img
    ? imageUrls(img.getAttribute("src"), Number(img.getAttribute("data-file-width") ?? 0))
    : null;
}

async function previewOf(url) {
  const bytes = url && (await get(url, true));
  if (!bytes) {
    return { thumb: null, thumbSize: null };
  }
  try {
    const { data, info } = await sharp(bytes)
      .flatten({ background: "#ffffff" })
      .resize(PREVIEW_WIDTH, PREVIEW_WIDTH, { fit: "inside" })
      .jpeg({ quality: 72 })
      .toBuffer({ resolveWithObject: true });
    return {
      thumb: `data:image/jpeg;base64,${data.toString("base64")}`,
      thumbSize: [info.width, info.height],
    };
  } catch {
    return { thumb: null, thumbSize: null };
  }
}

if (args.refresh) {
  const data = JSON.parse(readFileSync(args.refresh, "utf8"));
  const stale = data.rows.filter((r) => r.preview && !r.thumbSize);
  for (const row of stale) {
    await sleep(500);
    Object.assign(row, await previewOf(row.preview));
    process.stderr.write(row.thumb ? "." : "x");
  }
  writeFileSync(args.refresh, JSON.stringify(data));
  const left = data.rows.filter((r) => r.preview && !r.thumb).length;
  console.error(`\nRefreshed ${stale.length} previews, ${left} still missing.`);
  process.exit(left > 0 ? 1 : 0);
}

const listDoc = await page(titleOf(args.list));
if (!listDoc) {
  console.error(`Could not read the list page "${args.list}" on ${WIKI}.`);
  process.exit(1);
}
const titles = linksFrom(listDoc).slice(0, Number(args.limit));
console.error(`${titles.length} linked pages on "${titleOf(args.list)}"`);

const rows = [];
const skipped = [];
for (const title of titles) {
  await sleep(250);
  const doc = await page(title);
  const box = doc?.querySelector("table.infobox");
  if (!box) {
    skipped.push(title);
    process.stderr.write("x");
    continue;
  }
  const fields = {};
  for (const tr of all(box, "tr")) {
    const th = tr.querySelector("th.infobox-label");
    all(th ?? tr, "br").forEach((br) => br.replaceWith(" "));
    const td = tr.querySelector("td.infobox-data");
    const label = th && clean(th.textContent);
    if (label && td && !(label in fields)) {
      const value = valueOf(td);
      if (value.length > 0) {
        fields[label] = value;
      }
    }
  }
  const pageTitle = clean(doc.querySelector("title")?.textContent ?? title);
  const image = await pageImage(pageTitle, box);
  rows.push({
    name: pageTitle.replace(/ \([^)]*\)$/, ""),
    title: pageTitle,
    url: `${WIKI}/wiki/${encodeURIComponent(pageTitle.replace(/ /g, "_"))}`,
    image: image?.import ?? null,
    preview: image?.preview ?? null,
    ...(await previewOf(image?.preview)),
    fields,
  });
  process.stderr.write(".");
}

for (const row of rows.filter((r) => r.preview && !r.thumb)) {
  await sleep(5000);
  Object.assign(row, await previewOf(row.preview));
}
const unpictured = rows.filter((r) => r.preview && !r.thumb).map((r) => r.name);
if (unpictured.length > 0) {
  console.error(`Picture previews still failing for: ${unpictured.join(", ")}`);
}
const listTitle = titleOf(args.list);
writeFileSync(
  args.out,
  JSON.stringify({
    source: "Wikipedia",
    list: listTitle,
    listUrl: `${WIKI}/wiki/${encodeURIComponent(listTitle.replace(/ /g, "_"))}`,
    fetchedAt: new Date().toISOString(),
    skipped,
    rows,
  }),
);
console.error(
  `\n${rows.length} rows with an infobox, ${skipped.length} pages without one. Wrote ${args.out}`,
);
