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

export type Refusal = "invalid" | "duplicate" | "finished" | "not_finished";
export type GameOutcome = { kind: "ok"; view: GameView } | { kind: Refusal };

type Q = Pick<pg.Pool, "query">;

// Graded on read against the current answer, so an overridden answer applies at once
async function view(
  q: Q,
  roster: readonly Pet[],
  answer: Pet,
  userId: number,
  date: string,
  day: number,
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
  const ids = guesses.rows.map((row) => row.pet_id);
  const graded = gradeIds(roster, answer, ids);
  if (graded.kind !== "graded") {
    // A guessed pet left the roster; stored rows are never duplicated
    throw new Error("stored guesses no longer match the roster");
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

export function readGame(
  pool: pg.Pool,
  roster: readonly Pet[],
  answer: Pet,
  userId: number,
  date: string,
  day: number,
): Promise<GameView> {
  return view(pool, roster, answer, userId, date, day);
}

// Runs `action` in a transaction holding the user's row lock, so one player's
// concurrent requests are applied one at a time.
export async function changeGame(
  pool: pg.Pool,
  roster: readonly Pet[],
  answer: Pet,
  userId: number,
  date: string,
  day: number,
  action: (current: GameView, q: Q) => Promise<Refusal | null>,
): Promise<GameOutcome> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query("select 1 from users where id = $1 for update", [
      userId,
    ]);
    const current = await view(client, roster, answer, userId, date, day);
    const refusal = await action(current, client);
    if (refusal !== null) {
      await client.query("rollback");
      return { kind: refusal };
    }
    const next = await view(client, roster, answer, userId, date, day);
    await client.query("commit");
    return { kind: "ok", view: next };
  } catch (err) {
    await client.query("rollback");
    throw err;
  } finally {
    client.release();
  }
}
