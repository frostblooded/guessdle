// What a game needs from its entries before it plays, and which entries may be an answer.
import { hasAllValues, type Entry, type GameAttribute } from "../game/game.ts";
import { hasAllShots } from "../game/sequence.ts";
import type { GameRow } from "./games.ts";

// SQL true when the game aliased `g` has an active entry missing a value (no value rows for a
// non-Image attribute; blanks are never stored), or, in a Blur game, missing its photo or its
// square order, or a Quiz question missing its answer, or a Sequence game with no active entry that has every photo. Such a game is paused.
export const HAS_MISSING_VALUES = `(case when g.kind = 'quiz' then exists (
  select 1 from entries e where e.game_id = g.id and e.deleted_at is null and e.quiz is null)
when g.kind = 'sequence' then not exists (
  select 1 from entries e
  where e.game_id = g.id and e.deleted_at is null and cardinality(e.shots) >= g.blur_tries
    and not ('' = any(e.shots[1:g.blur_tries])))
when g.kind = 'blur' then exists (
  select 1 from entries e
  where e.game_id = g.id and e.deleted_at is null and (e.photo_url = '' or e.blur_order is null))
else exists (
  select 1 from entries e join attributes a on a.game_id = e.game_id
  where e.game_id = g.id and e.deleted_at is null and a.type <> 'image' and not exists (
    select 1 from entry_values v where v.entry_id = e.id and v.attribute_id = a.id)) end)`;

// An entry that pauses its game: a value missing, in a Blur game its photo or square order, or
// a Quiz question's answer.
// A Sequence entry never does on its own: without every photo it just cannot be the answer.
export const isIncomplete = (
  game: GameRow,
  roster: readonly GameAttribute[],
  entry: Entry,
): boolean =>
  game.kind === "sequence"
    ? false
    : game.kind === "quiz"
      ? entry.quiz === undefined
      : game.kind === "blur"
        ? entry.photo === "" || entry.blurOrder === undefined
        : !hasAllValues(roster, entry.values);

// Whether the entry may be a day's answer (other kinds pause instead while one is incomplete)
export const isAnswerable = (game: GameRow, entry: Entry): boolean =>
  game.kind !== "sequence" || hasAllShots(entry.shots ?? [], game.blurTries);
