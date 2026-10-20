import assert from "node:assert/strict";
import { afterAll, beforeAll, describe, it } from "vitest";
import type { GameKind } from "../../src/game/blur.ts";
import { HAS_MISSING_VALUES } from "../../src/server/completeness.ts";
import { findGame, loadRoster } from "../../src/server/games.ts";
import { MIGRATIONS_DIR } from "../../src/server/main.ts";
import { migrate } from "../../src/server/migrate.ts";
import { startDb, type TestDb } from "./postgres.ts";

// The gallery's SQL (HAS_MISSING_VALUES) and the Roster's KINDS rules must agree on which
// games are paused, for every kind
describe("paused games: SQL twin and KINDS agree", () => {
  let db: TestDb;
  let n = 0;
  beforeAll(async () => {
    db = await startDb();
    await migrate(db.pool, MIGRATIONS_DIR);
  });
  afterAll(async () => {
    await db.stop();
  });

  interface EntrySetup {
    photo?: string;
    blurOrder?: number[];
    shots?: string[];
    quiz?: object;
    // Classic: whether the entry has its one Text value
    value?: boolean;
  }
  // A game of `kind` (3 tries or photos) with one Text attribute and these entries
  const gameWith = async (
    kind: GameKind,
    entries: EntrySetup[],
  ): Promise<string> => {
    const slug = `kind-${++n}`;
    const { id } = (
      await db.pool.query<{ id: number }>(
        `insert into games (slug, name, start_date, kind, blur_tries)
         values ($1, $1, '2026-10-01', $2, 3) returning id::int`,
        [slug, kind],
      )
    ).rows[0]!;
    const attr = (
      await db.pool.query<{ id: number }>(
        "insert into attributes (game_id, name, type, position) values ($1, 'Color', 'text', 0) returning id::int",
        [id],
      )
    ).rows[0]!.id;
    for (const [i, e] of entries.entries()) {
      const entry = (
        await db.pool.query<{ id: number }>(
          `insert into entries (game_id, name, photo_url, blur_order, shots, quiz)
           values ($1, $2, $3, $4, $5, $6) returning id::int`,
          [
            id,
            `Entry ${i}`,
            e.photo ?? "",
            e.blurOrder ?? null,
            e.shots ?? [],
            e.quiz ?? null,
          ],
        )
      ).rows[0]!.id;
      if (e.value !== false) {
        await db.pool.query(
          "insert into entry_values (entry_id, attribute_id, position, value) values ($1, $2, 0, 'Red')",
          [entry, attr],
        );
      }
    }
    return slug;
  };
  const pausedBy = async (slug: string) => {
    const game = (await findGame(db.pool, slug))!;
    const sql = (
      await db.pool.query<{ paused: boolean }>(
        `select ${HAS_MISSING_VALUES} as paused from games g where g.id = $1`,
        [game.id],
      )
    ).rows[0]!.paused;
    const roster = (await loadRoster(db.pool, game)).incomplete > 0;
    return { sql, roster };
  };

  const order = [0, 1, 2, 3, 4, 5, 6, 7, 8];
  const quiz = { options: ["A", "B"], correct: 0 };
  const cases: [string, GameKind, EntrySetup[], boolean][] = [
    ["classic, every value", "classic", [{}, {}], false],
    ["classic, a value missing", "classic", [{}, { value: false }], true],
    [
      "blur, image and order",
      "blur",
      [{ photo: "/u/a.png", blurOrder: order }],
      false,
    ],
    ["blur, no order", "blur", [{ photo: "/u/a.png" }], true],
    ["blur, no image", "blur", [{ blurOrder: order }], true],
    [
      "sequence, one entry with every photo",
      "sequence",
      [{ shots: ["/a", "/b", "/c"] }, { shots: ["/a"] }],
      false,
    ],
    [
      "sequence, no entry with every photo",
      "sequence",
      [{ shots: ["/a", "", "/c"] }],
      true,
    ],
    ["quiz, every answer", "quiz", [{ quiz }], false],
    ["quiz, an answer missing", "quiz", [{ quiz }, {}], true],
  ];
  for (const [name, kind, entries, paused] of cases) {
    it(name, async () => {
      assert.deepEqual(await pausedBy(await gameWith(kind, entries)), {
        sql: paused,
        roster: paused,
      });
    });
  }
});
