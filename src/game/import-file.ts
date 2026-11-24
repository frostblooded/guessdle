import type { AttributeType } from "./game.ts";
import {
  MAX_ATTRIBUTE_NAME,
  MAX_ATTRIBUTES,
  MAX_ENTRY_NAME,
  MAX_LIST_ITEMS,
  MAX_VALUE_LENGTH,
} from "./limits.ts";
import { parseNumberValue } from "./number.ts";

export const IMPORT_FORMAT = "guessdle-import/1";
export const MAX_IMPORT_ENTRIES = 300;
export const IMPORT_IMAGE_HOSTS: readonly string[] = ["upload.wikimedia.org"];

export type ImportAttributeType = Exclude<AttributeType, "image">;

export interface ImportAttribute {
  name: string;
  type: ImportAttributeType;
}

export interface ImportEntry {
  name: string;
  image: string | null;
  values: Record<string, string[]>;
}

export interface ImportFile {
  source: string;
  attributes: ImportAttribute[];
  entries: ImportEntry[];
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const textIn = (v: unknown, max: number): string | undefined =>
  typeof v === "string" && v.trim() !== "" && v.trim().length <= max
    ? v.trim()
    : undefined;

const isImportType = (v: unknown): v is ImportAttributeType =>
  v === "text" || v === "list" || v === "number";

export const isImportImage = (url: string): boolean => {
  try {
    const parsed = new URL(url);
    return (
      parsed.protocol === "https:" && IMPORT_IMAGE_HOSTS.includes(parsed.host)
    );
  } catch {
    return false;
  }
};

function valuesOf(
  raw: unknown,
  type: ImportAttributeType,
): string[] | undefined {
  const items = Array.isArray(raw) ? raw : [raw];
  const texts = items.map((item) =>
    textIn(typeof item === "number" ? String(item) : item, MAX_VALUE_LENGTH),
  );
  if (texts.length === 0 || texts.some((t) => t === undefined)) {
    return undefined;
  }
  if (type === "list") {
    return texts.length <= MAX_LIST_ITEMS ? (texts as string[]) : undefined;
  }
  if (texts.length !== 1) {
    return undefined;
  }
  if (type === "number") {
    const number = parseNumberValue(texts[0]!);
    return number === null ? undefined : [number];
  }
  return texts as string[];
}

function attributesOf(raw: unknown): ImportAttribute[] | undefined {
  if (!Array.isArray(raw) || raw.length > MAX_ATTRIBUTES) {
    return undefined;
  }
  const attributes: ImportAttribute[] = [];
  for (const item of raw) {
    const name = isRecord(item)
      ? textIn(item["name"], MAX_ATTRIBUTE_NAME)
      : undefined;
    const type = isRecord(item) ? item["type"] : undefined;
    if (
      name === undefined ||
      !isImportType(type) ||
      attributes.some((a) => a.name.toLowerCase() === name.toLowerCase())
    ) {
      return undefined;
    }
    attributes.push({ name, type });
  }
  return attributes;
}

function entryOf(
  raw: unknown,
  attributes: ImportAttribute[],
): ImportEntry | undefined {
  if (!isRecord(raw)) {
    return undefined;
  }
  const name = textIn(raw["name"], MAX_ENTRY_NAME);
  const image = raw["image"] ?? null;
  const values = raw["values"];
  if (
    name === undefined ||
    !isRecord(values) ||
    (image !== null && (typeof image !== "string" || !isImportImage(image)))
  ) {
    return undefined;
  }
  const parsed: Record<string, string[]> = {};
  for (const attribute of attributes) {
    const items = valuesOf(values[attribute.name], attribute.type);
    if (items === undefined) {
      return undefined;
    }
    parsed[attribute.name] = items;
  }
  return { name, image, values: parsed };
}

export function parseImportFile(raw: unknown): ImportFile | undefined {
  if (!isRecord(raw) || raw["format"] !== IMPORT_FORMAT) {
    return undefined;
  }
  const attributes = attributesOf(raw["attributes"]);
  const rawEntries = raw["entries"];
  if (
    attributes === undefined ||
    !Array.isArray(rawEntries) ||
    rawEntries.length === 0 ||
    rawEntries.length > MAX_IMPORT_ENTRIES
  ) {
    return undefined;
  }
  const entries: ImportEntry[] = [];
  for (const item of rawEntries) {
    const entry = entryOf(item, attributes);
    if (
      entry === undefined ||
      entries.some((e) => e.name.toLowerCase() === entry.name.toLowerCase())
    ) {
      return undefined;
    }
    entries.push(entry);
  }
  const source = typeof raw["source"] === "string" ? raw["source"] : "";
  return { source: source.slice(0, MAX_VALUE_LENGTH), attributes, entries };
}
