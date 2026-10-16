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
