import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { parseImportFile } from "../src/game/import-file.ts";
import {
  categoriesOf,
  cellKey,
  guessType,
  importBody,
  importFileOf,
  importValues,
  numberIn,
  problems,
  type Picks,
  type WikiRow,
} from "../src/game/wiki-pick.ts";

const row = (
  order: number,
  name: string,
  fields: WikiRow["fields"],
): WikiRow => ({
  order,
  name,
  title: name,
  url: `https://en.wikipedia.org/wiki/${name}`,
  image: `https://upload.wikimedia.org/wikipedia/en/${order}.jpg`,
  thumb: `https://upload.wikimedia.org/wikipedia/en/${order}.jpg`,
  thumbSize: [200, 300],
  fields,
});

const rows: WikiRow[] = [
  row(0, "Toy Story", {
    "Directed by": "John Lasseter",
    "Running time": "81 minutes",
    "Box office": "$401.2 million",
    Starring: ["Tom Hanks", "Tim Allen"],
  }),
  row(1, "Cars", {
    "Directed by": "John Lasseter",
    "Running time": "117 minutes",
    Starring: ["Owen Wilson"],
  }),
  row(2, "Up", { "Directed by": "Pete Docter", Starring: ["Ed Asner"] }),
];

const picks = (over: Partial<Picks> = {}): Picks => ({
  on: [],
  types: {},
  edits: {},
  names: {},
  crops: {},
  ...over,
});

describe("numberIn", () => {
  it("takes the number out of the text, with scale words and commas", () => {
    assert.equal(numberIn("81 minutes"), 81);
    assert.equal(numberIn("$401.2 million"), 401200000);
    assert.equal(numberIn("1,234,567 people"), 1234567);
    assert.equal(numberIn("unknown"), null);
  });
});

describe("categories", () => {
  it("offers fields on at least 60% of the rows, most common first", () => {
    assert.deepEqual(categoriesOf(rows, []), [
      "Directed by",
      "Starring",
      "Running time",
    ]);
  });

  it("keeps a ticked field even when it falls under 60%", () => {
    assert.ok(categoriesOf(rows, ["Box office"]).includes("Box office"));
  });

  it("guesses list, number or text from the values", () => {
    assert.equal(guessType(rows, "Starring"), "list");
    assert.equal(guessType(rows, "Running time"), "number");
    assert.equal(guessType(rows, "Directed by"), "text");
  });
});

describe("rows", () => {
  it("blocks a row missing a ticked field instead of filling it in", () => {
    const p = picks({
      on: ["Running time"],
      types: { "Running time": "number" },
    });
    assert.deepEqual(problems(rows[2]!, rows, p), ["no Running time"]);
    assert.deepEqual(problems(rows[0]!, rows, p), []);
  });

  it("uses an edited value in place of the Wikipedia one", () => {
    const p = picks({
      on: ["Running time"],
      types: { "Running time": "number" },
      edits: { [cellKey(2, "Running time")]: ["96 minutes"] },
    });
    assert.deepEqual(problems(rows[2]!, rows, p), []);
    assert.deepEqual(importValues(rows[2]!, "Running time", p), ["96"]);
  });

  it("blocks two rows renamed to the same name", () => {
    const p = picks({ names: { 1: "toy story" } });
    assert.deepEqual(problems(rows[0]!, rows, p), ["same name as another row"]);
  });
});

describe("importFileOf", () => {
  it("builds a file the importer accepts, with centred square crops", () => {
    const p = picks({
      on: ["Directed by", "Starring", "Running time"],
      types: {
        "Directed by": "text",
        Starring: "list",
        "Running time": "number",
      },
    });
    const file = importFileOf(
      "https://en.wikipedia.org/wiki/List",
      rows,
      [0, 1],
      p,
    );
    const parsed = parseImportFile(importBody(file));
    assert.ok(parsed);
    assert.deepEqual(
      parsed.entries.map((e) => [e.name, e.values]),
      [
        [
          "Toy Story",
          {
            "Directed by": ["John Lasseter"],
            Starring: ["Tom Hanks", "Tim Allen"],
            "Running time": ["81"],
          },
        ],
        [
          "Cars",
          {
            "Directed by": ["John Lasseter"],
            Starring: ["Owen Wilson"],
            "Running time": ["117"],
          },
        ],
      ],
    );
    assert.deepEqual(parsed.entries[0]!.crop, {
      left: 0,
      top: 0.1667,
      width: 1,
      height: 0.6667,
    });
  });
});
