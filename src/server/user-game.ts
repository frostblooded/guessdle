// A signed-in player's Board for one day, stored in Postgres: the DayStore adapter behind
// day-session.ts for accounts.
import type pg from "pg";
import type { HintPick } from "../game/free-hint.ts";
import { SKIP } from "../game/game.ts";
import { forgetBoard } from "./day-rows.ts";
import {
  daySession,
  type DaySession,
  type DayStore,
  type Refusal,
} from "./day-session.ts";
import type { PlayDay } from "./play-day.ts";

type Q = Pick<pg.Pool, "query">;

// Who is playing which Day of play
export interface GameContext extends PlayDay {
  userId: number;
}

export function userStore(q: Q, { game, userId, date }: GameContext): DayStore {
  const key = [userId, game.id, date];
  return {
    async read() {
      const guesses = await q.query<{ entry_id: number }>(
        // A skip is stored with no entry (migration 011)
        `select coalesce(entry_id, ${SKIP})::int as entry_id from user_guesses
         where user_id = $1 and game_id = $2 and day = $3 order by seq`,
        key,
      );
      const gaveUp =
        (
          await q.query(
            "select 1 from user_give_ups where user_id = $1 and game_id = $2 and day = $3",
            key,
          )
        ).rowCount === 1;
      const hint = await q.query<{ attribute: string }>(
        "select attribute from user_hints where user_id = $1 and game_id = $2 and day = $3",
        key,
      );
      const row = hint.rows[0];
      return {
        ids: guesses.rows.map((r) => r.entry_id),
        gaveUp,
        hint: row
          ? ({ kind: "attribute", attribute: row.attribute } satisfies HintPick)
          : null,
      };
    },
    async addGuess(id: number) {
      const { rowCount } = await q.query(
        "insert into user_guesses (user_id, game_id, day, entry_id) values ($1, $2, $3, $4) on conflict do nothing",
        [...key, id === SKIP ? null : id],
      );
      return rowCount === 1;
    },
    async giveUp() {
      await q.query(
        "insert into user_give_ups (user_id, game_id, day) values ($1, $2, $3)",
        key,
      );
    },
    async setHint(pick: HintPick) {
      const { rowCount } = await q.query(
        "insert into user_hints (user_id, game_id, day, kind, attribute) values ($1, $2, $3, $4, $5) on conflict do nothing",
        [...key, pick.kind, pick.attribute],
      );
      return rowCount === 1;
    },
    // Adopted guesses have no time: the solve clock falls back to the browser's
    async adopt(ids: readonly number[], gaveUp: boolean) {
      for (const id of ids) {
        await q.query(
          "insert into user_guesses (user_id, game_id, day, entry_id, guessed_at) values ($1, $2, $3, $4, null)",
          [...key, id === SKIP ? null : id],
        );
      }
      if (gaveUp) {
        await this.giveUp();
      }
    },
    reset: () => forgetBoard(q, game.id, date, userId),
    // Whole seconds from the board's first stored guess to its last; null when a guess has no time
    async seconds() {
      const { rows } = await q.query<{ seconds: number | null }>(
        `select case when count(*) > 0 and count(guessed_at) = count(*)
           then round(extract(epoch from max(guessed_at) - min(guessed_at)))::int end as seconds
         from user_guesses where user_id = $1 and game_id = $2 and day = $3`,
        key,
      );
      return rows[0]?.seconds ?? null;
    },
  };
}

// The account's Day session, reading straight from the pool (no lock)
export const userSession = (
  q: Q,
  ctx: GameContext,
  random: () => number,
): DaySession =>
  daySession(q, ctx, `user:${ctx.userId}`, userStore(q, ctx), random);

// Runs `action` on the account's Day session in a transaction holding the user's row lock,
// so one player's concurrent requests are applied one at a time (and a merge's "no rows yet"
// check and its inserts are one atomic step). A refusal rolls back.
export async function changeGame<T extends object>(
  pool: pg.Pool,
  ctx: GameContext,
  random: () => number,
  action: (session: DaySession) => Promise<T | Refusal>,
): Promise<T | Refusal> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query("select 1 from users where id = $1 for update", [
      ctx.userId,
    ]);
    const out = await action(userSession(client, ctx, random));
    await client.query(typeof out === "string" ? "rollback" : "commit");
    return out;
  } catch (err) {
    await client.query("rollback");
    throw err;
  } finally {
    client.release();
  }
}
