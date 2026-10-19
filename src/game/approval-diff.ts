// What changed in a game since an admin last approved it: the game as approved (a Snapshot,
// saved on approve) against the game now, as a list the admin reads before approving again.
import type { AttributeType } from "./game.ts";
import type { AttributeValue } from "./correctness.ts";
import { isChoice, type QuizSpec } from "./quiz.ts";
import type { GameKind } from "./blur.ts";

export interface SnapshotEntry {
  id: number;
  name: string;
  // Blur and Quiz games only; a classic game's pictures are Image values
  photo: string;
  description: string;
  // By attribute id
  values: Record<string, AttributeValue>;
  blurOrder?: number[];
  shots?: string[];
  quiz?: QuizSpec;
}

export interface Snapshot {
  // When it was taken (ISO)
  at: string;
  kind: GameKind;
  name: string;
  description: string;
  cover: string;
  blurTries: number;
  attributes: { id: number; name: string; type: AttributeType }[];
  // Active entries
  entries: SnapshotEntry[];
}

// One changed field: `image` when the values are picture URLs
export interface FieldChange {
  label: string;
  before: string[];
  after: string[];
  image: boolean;
}

export interface Change {
  section: "Details" | "Attributes" | "Entries" | "Questions";
  subject: string;
  kind: "added" | "removed" | "changed";
  fields: FieldChange[];
}

const list = (value: AttributeValue | undefined): string[] =>
  (Array.isArray(value) ? value : [value ?? ""]).filter((v) => v !== "");

const quizText = (spec: QuizSpec | undefined): string[] =>
  !spec
    ? []
    : isChoice(spec)
      ? spec.options.map((o, i) => (i === spec.correct ? `${o} (correct)` : o))
      : [`${spec.answer} (within ${spec.range})`];

const field = (
  label: string,
  values: string[],
  image = false,
): FieldChange => ({ label, before: [], after: values, image });

// An entry's fields as label, values and whether they are pictures, in editor order
function fieldsOf(
  kind: GameKind,
  attributes: Snapshot["attributes"],
  entry: SnapshotEntry,
): FieldChange[] {
  return [
    field(kind === "quiz" ? "Question" : "Name", [entry.name]),
    ...(kind === "blur" || kind === "quiz"
      ? [field("Picture", list(entry.photo), true)]
      : []),
    ...attributes.map((a) =>
      field(a.name, list(entry.values[String(a.id)]), a.type === "image"),
    ),
    ...(kind === "sequence" ? [field("Photos", entry.shots ?? [], true)] : []),
    ...(kind === "blur"
      ? [
          field(
            "Clear order",
            entry.blurOrder
              ? [entry.blurOrder.map((c) => c + 1).join(", ")]
              : [],
          ),
        ]
      : []),
    ...(kind === "quiz" ? [field("Answer", quizText(entry.quiz))] : []),
    field("Description", list(entry.description)),
  ];
}

const same = (a: string[], b: string[]): boolean =>
  a.length === b.length && a.every((v, i) => v === b[i]);

// Changed fields of `now` against `then`, matched by label
function fieldDiff(then: FieldChange[], now: FieldChange[]): FieldChange[] {
  return now.flatMap((field) => {
    const before = then.find((f) => f.label === field.label)?.after ?? [];
    return same(before, field.after) ? [] : [{ ...field, before }];
  });
}

// Tries count only in the kinds that have them
const detailsOf = (game: Snapshot, kind: GameKind): FieldChange[] => [
  field("Name", [game.name]),
  field("Description", list(game.description)),
  field("Cover", list(game.cover), true),
  ...(kind === "blur" || kind === "sequence"
    ? [field("Tries", [String(game.blurTries)])]
    : []),
];

export function diffGame(then: Snapshot, now: Snapshot): Change[] {
  const changes: Change[] = [];
  const details = fieldDiff(
    detailsOf(then, now.kind),
    detailsOf(now, now.kind),
  );
  if (details.length > 0) {
    changes.push({
      section: "Details",
      subject: now.name,
      kind: "changed",
      fields: details,
    });
  }

  for (const attr of now.attributes) {
    const old = then.attributes.find((a) => a.id === attr.id);
    if (!old) {
      changes.push({
        section: "Attributes",
        subject: `${attr.name} (${attr.type})`,
        kind: "added",
        fields: [],
      });
    } else if (old.name !== attr.name || old.type !== attr.type) {
      changes.push({
        section: "Attributes",
        subject: attr.name,
        kind: "changed",
        fields: fieldDiff(
          [field("Name", [old.name]), field("Type", [old.type])],
          [field("Name", [attr.name]), field("Type", [attr.type])],
        ),
      });
    }
  }
  for (const attr of then.attributes) {
    if (!now.attributes.some((a) => a.id === attr.id)) {
      changes.push({
        section: "Attributes",
        subject: attr.name,
        kind: "removed",
        fields: [],
      });
    }
  }

  const section = now.kind === "quiz" ? "Questions" : "Entries";
  for (const entry of now.entries) {
    const fields = fieldsOf(now.kind, now.attributes, entry);
    const old = then.entries.find((e) => e.id === entry.id);
    if (!old) {
      changes.push({
        section,
        subject: entry.name,
        kind: "added",
        fields: fields.filter((f) => f.after.length > 0),
      });
      continue;
    }
    // The old values under today's attributes, so a renamed one still lines up
    const changed = fieldDiff(fieldsOf(now.kind, now.attributes, old), fields);
    if (changed.length > 0) {
      changes.push({
        section,
        subject: entry.name,
        kind: "changed",
        fields: changed,
      });
    }
  }
  for (const entry of then.entries) {
    if (!now.entries.some((e) => e.id === entry.id)) {
      changes.push({
        section,
        subject: entry.name,
        kind: "removed",
        fields: [],
      });
    }
  }
  return changes;
}
