import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { diffGame, type Snapshot } from "../src/game/approval-diff.ts";

const base: Snapshot = {
  at: "2026-10-19T10:00:00Z",
  kind: "classic",
  name: "Zoo",
  description: "",
  cover: "",
  blurTries: 9,
  attributes: [
    { id: 1, name: "Color", type: "list" },
    { id: 2, name: "Photo", type: "image" },
  ],
  entries: [
    {
      id: 10,
      name: "Ati",
      photo: "",
      description: "",
      values: { "1": ["black"], "2": "/uploads/a.png" },
    },
  ],
};

describe("diffGame", () => {
  it("finds nothing in an unchanged game", () => {
    assert.deepEqual(diffGame(base, base), []);
  });

  it("matches attributes by id, so a rename lines up the old values", () => {
    const now: Snapshot = {
      ...base,
      attributes: [
        { id: 1, name: "Colors", type: "list" },
        { id: 3, name: "Age", type: "number" },
      ],
      entries: [
        {
          ...base.entries[0]!,
          values: { "1": ["black", "white"], "3": "4" },
        },
      ],
    };
    assert.deepEqual(diffGame(base, now), [
      {
        section: "Attributes",
        subject: "Colors",
        kind: "changed",
        fields: [
          { label: "Name", before: ["Color"], after: ["Colors"], image: false },
        ],
      },
      {
        section: "Attributes",
        subject: "Age (number)",
        kind: "added",
        fields: [],
      },
      { section: "Attributes", subject: "Photo", kind: "removed", fields: [] },
      {
        section: "Entries",
        subject: "Ati",
        kind: "changed",
        fields: [
          {
            label: "Colors",
            before: ["black"],
            after: ["black", "white"],
            image: false,
          },
          { label: "Age", before: [], after: ["4"], image: false },
        ],
      },
    ]);
  });

  it("marks picture fields and lists a new entry's filled fields", () => {
    const now: Snapshot = {
      ...base,
      cover: "/uploads/c.png",
      entries: [
        ...base.entries,
        {
          id: 11,
          name: "Bela",
          photo: "",
          description: "",
          values: { "1": ["red"], "2": "" },
        },
      ],
    };
    assert.deepEqual(diffGame(base, now), [
      {
        section: "Details",
        subject: "Zoo",
        kind: "changed",
        fields: [
          {
            label: "Cover",
            before: [],
            after: ["/uploads/c.png"],
            image: true,
          },
        ],
      },
      {
        section: "Entries",
        subject: "Bela",
        kind: "added",
        fields: [
          { label: "Name", before: [], after: ["Bela"], image: false },
          { label: "Color", before: [], after: ["red"], image: false },
        ],
      },
    ]);
  });

  it("shows a quiz's answers and tries only where the kind has them", () => {
    const quiz = (correct: number): Snapshot => ({
      ...base,
      kind: "quiz",
      attributes: [],
      blurTries: correct,
      entries: [
        {
          id: 10,
          name: "2+2?",
          photo: "",
          description: "",
          values: {},
          quiz: { options: ["3", "4"], correct },
        },
      ],
    });
    assert.deepEqual(diffGame(quiz(0), quiz(1)), [
      {
        section: "Questions",
        subject: "2+2?",
        kind: "changed",
        fields: [
          {
            label: "Answer",
            before: ["3 (correct)", "4"],
            after: ["3", "4 (correct)"],
            image: false,
          },
        ],
      },
    ]);
  });
});
