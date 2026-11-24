import {
  IMPORT_FORMAT,
  type ImportAttributeType,
  type ImportCrop,
  type ImportFile,
} from "./import-file.ts";
import {
  MAX_ATTRIBUTES,
  MAX_ENTRY_NAME,
  MAX_LIST_ITEMS,
  MAX_VALUE_LENGTH,
} from "./limits.ts";

export type FieldValue = string | string[];

export interface WikiRow {
  order: number;
  name: string;
  title: string;
  url: string;
  image: string | null;
  thumb: string | null;
  thumbSize: [number, number] | null;
  fields: Record<string, FieldValue>;
}

export interface Picks {
  on: string[];
  types: Record<string, ImportAttributeType>;
  edits: Record<string, string[]>;
  names: Record<number, string>;
  crops: Record<number, ImportCrop>;
}

export const MAX_PICKED_CATEGORIES = MAX_ATTRIBUTES - 1;
export const CATEGORY_SHARE = 0.6;

const SCALE: Record<string, number> = {
  thousand: 1e3,
  million: 1e6,
  billion: 1e9,
  trillion: 1e12,
};

export function numberIn(raw: string): number | null {
  const text = raw.replace(/(\d),(?=\d{3}\b)/g, "$1");
  const match = /-?\d+(\.\d+)?/.exec(text);
  if (!match) {
    return null;
  }
  const word = /^\s*(thousand|million|billion|trillion)\b/i.exec(
    text.slice(match.index + match[0].length),
  );
  const value =
    parseFloat(match[0]) * (word ? SCALE[word[1]!.toLowerCase()]! : 1);
  return Number.isFinite(value) ? Number(value.toPrecision(12)) : null;
}

export const asList = (v: FieldValue): string[] => (Array.isArray(v) ? v : [v]);

export const cellKey = (order: number, field: string): string =>
  `${order}\u0000${field}`;

export function coverage(rows: WikiRow[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const row of rows) {
    for (const field of Object.keys(row.fields)) {
      counts[field] = (counts[field] ?? 0) + 1;
    }
  }
  return counts;
}

export function categoriesOf(rows: WikiRow[], on: string[]): string[] {
  const counts = coverage(rows);
  return Object.keys(counts)
    .filter((k) => counts[k]! / rows.length >= CATEGORY_SHARE || on.includes(k))
    .sort((a, b) => counts[b]! - counts[a]! || a.localeCompare(b));
}

export function guessType(rows: WikiRow[], field: string): ImportAttributeType {
  const values = rows.flatMap((r) =>
    field in r.fields ? [r.fields[field]!] : [],
  );
  if (values.some(Array.isArray)) {
    return "list";
  }
  return values.every(
    (v) =>
      /^[^\d]{0,3}-?\d/.test(v as string) && numberIn(v as string) !== null,
  )
    ? "number"
    : "text";
}

export const nameOf = (row: WikiRow, picks: Picks): string =>
  picks.names[row.order] ?? row.name;

export function rawValue(
  row: WikiRow,
  field: string,
  picks: Picks,
): string[] | null {
  const edit = picks.edits[cellKey(row.order, field)];
  if (edit) {
    return edit;
  }
  return field in row.fields ? asList(row.fields[field]!) : null;
}

export function importValues(
  row: WikiRow,
  field: string,
  picks: Picks,
): string[] | null {
  const raw = rawValue(row, field, picks);
  if (raw === null) {
    return null;
  }
  const type = picks.types[field] ?? "text";
  if (type === "number") {
    const value = numberIn(raw[0] ?? "");
    return value === null ? null : [String(value)];
  }
  return type === "list" ? raw : [raw.join(", ")];
}

export function problems(
  row: WikiRow,
  rows: WikiRow[],
  picks: Picks,
): string[] {
  const name = nameOf(row, picks).trim();
  const out: string[] = [];
  if (name === "") {
    out.push("no name");
  }
  if (name.length > MAX_ENTRY_NAME) {
    out.push("name too long");
  }
  if (
    rows.some(
      (other) =>
        other.order !== row.order &&
        nameOf(other, picks).trim().toLowerCase() === name.toLowerCase(),
    )
  ) {
    out.push("same name as another row");
  }
  for (const field of picks.on) {
    const values = importValues(row, field, picks);
    if (rawValue(row, field, picks) === null) {
      out.push(`no ${field}`);
    } else if (values === null) {
      out.push(`no number in ${field}`);
    } else if (values.length > MAX_LIST_ITEMS) {
      out.push(`${field} has over ${MAX_LIST_ITEMS} items`);
    } else if (values.some((v) => v.length > MAX_VALUE_LENGTH)) {
      out.push(`${field} too long`);
    }
  }
  return out;
}

export function centeredSquare([width, height]: [number, number]): ImportCrop {
  return width >= height
    ? {
        left: (1 - height / width) / 2,
        top: 0,
        width: height / width,
        height: 1,
      }
    : {
        left: 0,
        top: (1 - width / height) / 2,
        width: 1,
        height: width / height,
      };
}

export const cropOf = (row: WikiRow, picks: Picks): ImportCrop | null =>
  picks.crops[row.order] ??
  (row.thumbSize ? centeredSquare(row.thumbSize) : null);

const round = (x: number): number => Number(x.toFixed(4));

export function importFileOf(
  source: string,
  rows: WikiRow[],
  picked: number[],
  picks: Picks,
): ImportFile {
  return {
    source,
    attributes: picks.on.map((name) => ({
      name,
      type: picks.types[name] ?? "text",
    })),
    entries: rows
      .filter((row) => picked.includes(row.order))
      .map((row) => {
        const crop = row.image ? cropOf(row, picks) : null;
        return {
          name: nameOf(row, picks).trim(),
          image: row.image,
          crop: crop && {
            left: round(crop.left),
            top: round(crop.top),
            width: round(crop.width),
            height: round(crop.height),
          },
          values: Object.fromEntries(
            picks.on.map((field) => [
              field,
              importValues(row, field, picks) ?? [],
            ]),
          ),
        };
      }),
  };
}

export const importBody = (file: ImportFile): Record<string, unknown> => ({
  format: IMPORT_FORMAT,
  ...file,
});
