// A signed-in player's Game State for one day, stored in Postgres.
import type pg from "pg";
import { gradeIds, type GradedAttribute } from "../game/game.ts";
import type { Pet } from "../game/roster.ts";

export interface GameView {
  day: number;
  ids: string[];
  rows: GradedAttribute[][];
  victory: boolean;
  gaveUp: boolean;
  // The answer's name: present on victory and after a give-up
  answer?: string;
}

// Each refusal and the HTTP status it answers with
export const REFUSAL_STATUS = {
  invalid: 400,
  duplicate: 409,
  finished: 409,
  not_finished: 409,
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
  roster: readonly Pet[];
  answer: Pet;
  userId: number;
  date: string;
  day: number;
}

// Graded on read against the current answer, so an overridden answer applies at once
export async function view(
  q: Q,
  { roster, answer, userId, date, day }: GameContext,
): Promise<GameView> {
  const guesses = await q.query<{ pet_id: string }>(
    "select pet_id from user_guesses where user_id = $1 and day = $2 order by seq",
    [userId, date],
  );
  const gaveUp =
    (
      await q.query(
        "select 1 from user_give_ups where user_id = $1 and day = $2",
        [userId, date],
      )
    ).rowCount === 1;
  // Guesses of pets that left the roster are dropped from the view
  const known = new Set(roster.map((pet) => pet.id));
  const ids = guesses.rows
    .map((row) => row.pet_id)
    .filter((id) => known.has(id));
  const graded = gradeIds(roster, answer, ids);
  if (graded.kind !== "graded") {
    // Stored rows are never duplicated
    throw new Error("stored guesses are not gradable");
  }
  return {
    day,
    ids,
    rows: graded.rows,
    victory: graded.victory,
    gaveUp,
    ...((graded.victory || gaveUp) && { answer: answer.name }),
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
  current.victory || current.gaveUp;

export async function addGuess(
  q: Q,
  { roster, userId, date }: GameContext,
  current: GameView,
  id: unknown,
): Promise<Refusal | null> {
  if (typeof id !== "string" || !roster.some((pet) => pet.id === id)) {
    return "invalid";
  }
  if (finished(current)) {
    return "finished";
  }
  const { rowCount } = await q.query(
    "insert into user_guesses (user_id, day, pet_id) values ($1, $2, $3) on conflict do nothing",
    [userId, date, id],
  );
  return rowCount === 1 ? null : "duplicate";
}

export async function giveUp(
  q: Q,
  { userId, date }: GameContext,
  current: GameView,
): Promise<Refusal | null> {
  if (finished(current)) {
    return "finished";
  }
  await q.query("insert into user_give_ups (user_id, day) values ($1, $2)", [
    userId,
    date,
  ]);
  return null;
}

// Adopts anonymous local history (POST /api/game/merge body); the user-row lock
// in changeGame makes the "no rows yet" check and the inserts one atomic step.
export async function mergeLocal(
  q: Q,
  { roster, answer, userId, date, day }: GameContext,
  current: GameView,
  body: Record<string, unknown>,
): Promise<Refusal | null> {
  const { ids, gaveUp } = body;
  if (
    !Array.isArray(ids) ||
    ids.length > roster.length ||
    !ids.every((id) => roster.some((pet) => pet.id === id)) ||
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
  // Keep first occurrences in order, stop after the answer
  const keep = [...new Set(ids as string[])];
  const end = keep.indexOf(answer.id);
  const adopted = end === -1 ? keep : keep.slice(0, end + 1);
  for (const id of adopted) {
    await q.query(
      "insert into user_guesses (user_id, day, pet_id) values ($1, $2, $3)",
      [userId, date, id],
    );
  }
  if (gaveUp === true && end === -1) {
    await q.query("insert into user_give_ups (user_id, day) values ($1, $2)", [
      userId,
      date,
    ]);
  }
  return null;
}

export async function resetGame(
  q: Q,
  { userId, date }: GameContext,
  current: GameView,
): Promise<Refusal | null> {
  if (!finished(current)) {
    return "not_finished";
  }
  for (const table of ["user_guesses", "user_give_ups"]) {
    await q.query(`delete from ${table} where user_id = $1 and day = $2`, [
      userId,
      date,
    ]);
  }
  return null;
}
