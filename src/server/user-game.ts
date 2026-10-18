// A signed-in player's Game State for one day, stored in Postgres.
import type pg from "pg";
import {
  gradeIds,
  SKIP,
  type Entry,
  type GradedAttribute,
} from "../game/game.ts";
import { outOfTries } from "../game/blur.ts";
import type { GameRow, Roster } from "./games.ts";
import { isImageGame } from "../game/blur.ts";

export interface GameView {
  day: number;
  ids: number[];
  rows: GradedAttribute[][];
  victory: boolean;
  gaveUp: boolean;
  // Blur and Sequence games: every try was used without finding the answer
  lost?: true;
  // The answer's name: present once the day is over (victory, give-up or lost)
  answer?: string;
  // Blur games, once the day is over: the answer's whole image
  answerPhoto?: string;
}

// An id a player may guess: an active entry, or in a Blur or Sequence game SKIP
const isGuessId = (game: GameRow, roster: Roster, id: unknown): boolean =>
  (id === SKIP && isImageGame(game.kind)) ||
  roster.entries.some((e) => e.id === id);

// A Blur or Sequence game's tries, null for a classic game with unlimited guesses
export const triesOf = (game: GameRow): number | null =>
  isImageGame(game.kind) ? game.blurTries : null;

// The answer as a finished day reveals it: its name, and a Blur game's whole image or a
// Sequence game's first photo
export const revealOf = (
  game: GameRow,
  answer: Entry,
): { answer: string; answerPhoto?: string } => ({
  answer: answer.name,
  ...(game.kind === "blur" && { answerPhoto: answer.photo }),
  ...(game.kind === "sequence" &&
    answer.shots?.[0] && { answerPhoto: answer.shots[0] }),
});

// Whether `ids` used up a Blur game's tries without the answer
export const isLost = (
  game: GameRow,
  ids: readonly number[],
  victory: boolean,
): boolean => outOfTries(triesOf(game), ids.length, victory);

// Each refusal and the HTTP status it answers with
export const REFUSAL_STATUS = {
  invalid: 400,
  duplicate: 409,
  finished: 409,
  // merge: the account already has rows for the day
  has_progress: 409,
  // merge: the payload is for another day
  stale_day: 409,
} as const;
export type Refusal = keyof typeof REFUSAL_STATUS;
export type GameOutcome = { kind: "ok"; view: GameView } | { kind: Refusal };

type Q = Pick<pg.Pool, "query">;

// Who is playing which day, and against which answer
export interface GameContext {
  game: GameRow;
  roster: Roster;
  answer: Entry;
  userId: number;
  date: string;
  day: number;
  // An archive day (not today), played from the Past days list
  past: boolean;
}

// Graded on read against the current answer, so an overridden answer applies at once
export async function view(
  q: Q,
  { game, roster, answer, userId, date, day }: GameContext,
): Promise<GameView> {
  const guesses = await q.query<{ entry_id: number }>(
    // A skip is stored with no entry (migration 011)
    `select coalesce(entry_id, ${SKIP})::int as entry_id from user_guesses
     where user_id = $1 and game_id = $2 and day = $3 order by seq`,
    [userId, game.id, date],
  );
  const gaveUp =
    (
      await q.query(
        "select 1 from user_give_ups where user_id = $1 and game_id = $2 and day = $3",
        [userId, game.id, date],
      )
    ).rowCount === 1;
  // Soft-deleted entries still resolve, so past guesses keep their rows
  const ids = guesses.rows.map((row) => row.entry_id);
  const graded = gradeIds(
    roster.attributes,
    roster.all,
    answer,
    ids,
    game.kind,
  );
  if (graded.kind !== "graded") {
    // Stored rows are never duplicated
    throw new Error("stored guesses are not gradable");
  }
  const lost = isLost(game, ids, graded.victory);
  return {
    day,
    ids,
    rows: graded.rows,
    victory: graded.victory,
    gaveUp,
    ...(lost && { lost: true as const }),
    ...((graded.victory || gaveUp || lost) && revealOf(game, answer)),
  };
}

// Runs `action` in a transaction holding the user's row lock, so one player's
// concurrent requests are applied one at a time.
export async function changeGame(
  pool: pg.Pool,
  ctx: GameContext,
  action: (current: GameView, q: Q) => Promise<Refusal | null>,
): Promise<GameOutcome> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query("select 1 from users where id = $1 for update", [
      ctx.userId,
    ]);
    const current = await view(client, ctx);
    const refusal = await action(current, client);
    if (refusal !== null) {
      await client.query("rollback");
      return { kind: refusal };
    }
    const next = await view(client, ctx);
    await client.query("commit");
    return { kind: "ok", view: next };
  } catch (err) {
    await client.query("rollback");
    throw err;
  } finally {
    client.release();
  }
}

const finished = (current: GameView): boolean =>
  current.victory || current.gaveUp || current.lost === true;

export async function addGuess(
  q: Q,
  { game, roster, userId, date }: GameContext,
  current: GameView,
  id: unknown,
): Promise<Refusal | null> {
  if (typeof id !== "number" || !isGuessId(game, roster, id)) {
    return "invalid";
  }
  if (finished(current)) {
    return "finished";
  }
  const { rowCount } = await q.query(
    "insert into user_guesses (user_id, game_id, day, entry_id) values ($1, $2, $3, $4) on conflict do nothing",
    [userId, game.id, date, id === SKIP ? null : id],
  );
  return rowCount === 1 ? null : "duplicate";
}

export async function giveUp(
  q: Q,
  { game, userId, date }: GameContext,
  current: GameView,
): Promise<Refusal | null> {
  if (finished(current)) {
    return "finished";
  }
  await q.query(
    "insert into user_give_ups (user_id, game_id, day) values ($1, $2, $3)",
    [userId, game.id, date],
  );
  return null;
}

// Adopts anonymous local history (POST /api/games/:slug/state/merge body); the user-row lock
// in changeGame makes the "no rows yet" check and the inserts one atomic step.
export async function mergeLocal(
  q: Q,
  { game, roster, answer, userId, date, day }: GameContext,
  current: GameView,
  body: Record<string, unknown>,
): Promise<Refusal | null> {
  const { ids, gaveUp } = body;
  if (
    !Array.isArray(ids) ||
    ids.length > (triesOf(game) ?? roster.entries.length) ||
    !ids.every((id) => isGuessId(game, roster, id)) ||
    (gaveUp !== undefined && typeof gaveUp !== "boolean")
  ) {
    return "invalid";
  }
  if (body["day"] !== day) {
    return "stale_day";
  }
  if (current.ids.length > 0 || current.gaveUp) {
    return "has_progress";
  }
  // Keep first occurrences (and every skip) in order, stop after the answer
  const keep = (ids as number[]).filter(
    (id, i) => id === SKIP || ids.indexOf(id) === i,
  );
  const end = keep.indexOf(answer.id);
  const adopted = (end === -1 ? keep : keep.slice(0, end + 1)).slice(
    0,
    triesOf(game) ?? undefined,
  );
  for (const id of adopted) {
    await q.query(
      "insert into user_guesses (user_id, game_id, day, entry_id) values ($1, $2, $3, $4)",
      [userId, game.id, date, id === SKIP ? null : id],
    );
  }
  if (gaveUp === true && end === -1 && !isLost(game, adopted, false)) {
    await q.query(
      "insert into user_give_ups (user_id, game_id, day) values ($1, $2, $3)",
      [userId, game.id, date],
    );
  }
  return null;
}

export async function resetGame(
  q: Q,
  { game, userId, date }: GameContext,
): Promise<Refusal | null> {
  // Any time, even with no rows: deleting nothing is fine
  for (const table of ["user_guesses", "user_give_ups"]) {
    await q.query(
      `delete from ${table} where user_id = $1 and game_id = $2 and day = $3`,
      [userId, game.id, date],
    );
  }
  return null;
}
