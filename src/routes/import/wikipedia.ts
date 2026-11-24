import { IMPORT_IMAGE_HOSTS } from "../../game/import-file.ts";
import type { FieldValue, WikiRow } from "../../game/wiki-pick.ts";

export type WikiFetch = (
  url: string,
  init: { headers: Record<string, string>; signal: AbortSignal | null },
) => Promise<{ ok: boolean; status: number; text(): Promise<string> }>;

export type Wait = (ms: number) => Promise<void>;

export type RowsFrom = "auto" | "tables" | "bullets" | `${number}`;

export interface WikiList {
  wiki: string;
  title: string;
}

const IMPORT_WIDTH = 500;
const TRIES = 6;
const AGENT = {
  "Api-User-Agent": "Guessdle/1.0 (https://guessdle.niki.casa)",
};

const all = <T extends Element = Element>(
  root: ParentNode,
  sel: string,
): T[] => [...root.querySelectorAll<T>(sel)];

const clean = (s: string): string =>
  s
    .replace(/\[(\d+|[a-z]|note \d+|citation needed|nb \d+)\]/gi, "")
    .replace(/\s+/g, " ")
    .trim();

export function titleOf(raw: string): string {
  const path = raw
    .replace(/^https?:\/\/[^/]+\/wiki\//, "")
    .replace(/^\.\//, "")
    .split("#")[0]!
    .split("?")[0]!;
  try {
    return decodeURIComponent(path).replace(/_/g, " ").trim();
  } catch {
    return path.replace(/_/g, " ").trim();
  }
}

export function listOf(input: string): WikiList | null {
  const text = input.trim();
  const link =
    /^https?:\/\/([a-z-]+)(?:\.m)?\.wikipedia\.org\/wiki\/(.+)$/i.exec(text);
  if (link) {
    return { wiki: link[1]!.toLowerCase(), title: titleOf(link[2]!) };
  }
  if (text === "" || /^https?:/i.test(text)) {
    return null;
  }
  return { wiki: "en", title: titleOf(text) };
}

export const pageUrl = (wiki: string, title: string): string =>
  `https://${wiki}.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, "_"))}`;

const restUrl = (
  wiki: string,
  kind: "html" | "summary",
  title: string,
): string =>
  `https://${wiki}.wikipedia.org/api/rest_v1/page/${kind}/${encodeURIComponent(title.replace(/ /g, "_"))}${kind === "html" ? "?redirect=true" : ""}`;

const parse = (html: string): Document =>
  new DOMParser().parseFromString(html, "text/html");

export async function getText(
  fetch: WikiFetch,
  wait: Wait,
  url: string,
  signal?: AbortSignal,
): Promise<string | null | undefined> {
  for (let attempt = 0; attempt < TRIES; attempt++) {
    try {
      const res = await fetch(url, { headers: AGENT, signal: signal ?? null });
      if (res.ok) {
        return await res.text();
      }
      if (res.status === 404) {
        return null;
      }
      if (res.status < 500 && res.status !== 429) {
        return undefined;
      }
    } catch {
      if (signal?.aborted) {
        return undefined;
      }
    }
    await wait(1000 * 2 ** attempt);
  }
  return undefined;
}

function valueOf(td: Element): FieldValue {
  all(
    td,
    "sup, style, script, .reference, .mw-ref, .noprint, .sortkey, [style*='display:none'], [style*='display: none']",
  ).forEach((n) => n.remove());
  const items = all(td, "li")
    .map((li) => clean(li.textContent ?? ""))
    .filter(Boolean);
  if (items.length > 1) {
    return items;
  }
  const lines = td.innerHTML
    .split(/<br\s*\/?>/i)
    .map((part) => clean(parse(part).body.textContent ?? ""))
    .filter(Boolean);
  return lines.length > 1 ? lines : clean(td.textContent ?? "");
}

export function infoboxFields(
  doc: Document,
): Record<string, FieldValue> | null {
  const box = doc.querySelector("table.infobox");
  if (!box) {
    return null;
  }
  const fields: Record<string, FieldValue> = {};
  for (const tr of all(box, "tr")) {
    const th = tr.querySelector("th.infobox-label");
    const td = tr.querySelector("td.infobox-data");
    if (!th || !td) {
      continue;
    }
    all(th, "br").forEach((br) => br.replaceWith(" "));
    const label = clean(th.textContent ?? "");
    const value = label && !(label in fields) ? valueOf(td) : "";
    if (value.length > 0) {
      fields[label] = value;
    }
  }
  return fields;
}

export function listTitles(doc: Document, from: RowsFrom): string[] {
  const linkIn = (el: Element): string | undefined =>
    all(el, "a[rel='mw:WikiLink']")
      .map((a) => titleOf(a.getAttribute("href") ?? ""))
      .find((t) => t !== "" && !t.includes(":"));
  const tables = all(doc.body, "table.wikitable");
  const fromTables = (picked: Element[]): (string | undefined)[] =>
    picked.flatMap((table) =>
      all(table, "tr").map((tr) => {
        const head = tr.querySelector("th[scope=row]");
        return (head && linkIn(head)) || linkIn(tr);
      }),
    );
  const fromBullets = (): (string | undefined)[] =>
    all(
      doc.body,
      "section > ul > li, section > div > ul > li, section > ol > li",
    )
      .filter(
        (li) => !li.closest(".navbox, .reflist, .refbegin, .hatnote, .sidebar"),
      )
      .map(linkIn);
  const titles =
    from === "bullets"
      ? fromBullets()
      : from === "tables"
        ? fromTables(tables)
        : from === "auto"
          ? fromTables(tables).some(Boolean)
            ? fromTables(tables)
            : fromBullets()
          : fromTables(tables.slice(Number(from) - 1, Number(from)));
  return [...new Set(titles.filter((t): t is string => Boolean(t)))];
}

export function imageUrls(
  raw: string,
  fileWidth: number,
): { preview: string; import: string | null } {
  const src = (raw.startsWith("//") ? `https:${raw}` : raw)
    .split("?")[0]!
    .replace(
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
      : base && fileWidth > IMPORT_WIDTH
        ? `${base}/${IMPORT_WIDTH}px-${file}`
        : original;
  const allowed =
    forImport !== null && IMPORT_IMAGE_HOSTS.includes(new URL(forImport).host);
  return { preview: src, import: allowed ? forImport : null };
}

interface Summary {
  title?: string;
  originalimage?: { source: string; width: number; height: number };
  thumbnail?: { source: string; width: number; height: number };
}

const summaryOf = (text: string | null | undefined): Summary | null => {
  try {
    return text ? (JSON.parse(text) as Summary) : null;
  } catch {
    return null;
  }
};

export function rowOf(
  wiki: string,
  title: string,
  order: number,
  doc: Document,
  summary: Summary | null,
): WikiRow | null {
  const fields = infoboxFields(doc);
  if (fields === null) {
    return null;
  }
  const pageTitle = clean(summary?.title ?? title);
  let picture: {
    urls: ReturnType<typeof imageUrls>;
    size: [number, number];
  } | null = null;
  if (summary?.originalimage) {
    const shown = summary.thumbnail ?? summary.originalimage;
    picture = {
      urls: imageUrls(shown.source, summary.originalimage.width),
      size: [shown.width, shown.height],
    };
  } else {
    const img = doc.querySelector("table.infobox img");
    if (img) {
      picture = {
        urls: imageUrls(
          img.getAttribute("src") ?? "",
          Number(img.getAttribute("data-file-width") ?? 0),
        ),
        size: [
          Number(img.getAttribute("width")) || 1,
          Number(img.getAttribute("height")) || 1,
        ],
      };
    }
  }
  return {
    order,
    name: pageTitle.replace(/ \([^)]*\)$/, ""),
    title: pageTitle,
    url: pageUrl(wiki, pageTitle),
    image: picture?.urls.import ?? null,
    thumb: picture?.urls.preview ?? null,
    thumbSize: picture?.size ?? null,
    fields,
  };
}

export type PageRead = WikiRow | "no-infobox" | "failed";

export async function readPage(
  fetch: WikiFetch,
  wait: Wait,
  wiki: string,
  title: string,
  order: number,
  signal?: AbortSignal,
): Promise<PageRead> {
  const [html, summary] = await Promise.all([
    getText(fetch, wait, restUrl(wiki, "html", title), signal),
    getText(fetch, wait, restUrl(wiki, "summary", title), signal),
  ]);
  if (html === undefined) {
    return "failed";
  }
  const row =
    html === null
      ? null
      : rowOf(wiki, title, order, parse(html), summaryOf(summary));
  return row ?? "no-infobox";
}

export async function readList(
  fetch: WikiFetch,
  wait: Wait,
  list: WikiList,
  from: RowsFrom,
  signal?: AbortSignal,
): Promise<string[] | null> {
  const html = await getText(
    fetch,
    wait,
    restUrl(list.wiki, "html", list.title),
    signal,
  );
  return html ? listTitles(parse(html), from) : null;
}
