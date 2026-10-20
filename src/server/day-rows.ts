// Every row a Day of play keeps per player, and the one place that forgets them: a signed-in
// player's Game State (guesses, give-up, Free Hint) and each player's first try (results.ts).
import type pg from "pg";

type Q = Pick<pg.Pool, "query">;

const STATE_TABLES = ["user_guesses", "user_give_ups", "user_hints"] as const;

// A reset: the account's Game State for the day goes, its first try stays
export async function forgetBoard(
  q: Q,
  gameId: number,
  date: string,
  userId: number,
): Promise<void> {
  for (const table of STATE_TABLES) {
    await q.query(
      `delete from ${table} where user_id = $1 and game_id = $2 and day = $3`,
      [userId, gameId, date],
    );
  }
}

// The day's answer changed: everyone's Game State and first try go, so the day starts over
export async function forgetDay(
  q: Q,
  gameId: number,
  date: string,
): Promise<void> {
  for (const table of [...STATE_TABLES, "game_results"]) {
    await q.query(`delete from ${table} where game_id = $1 and day = $2`, [
      gameId,
      date,
    ]);
  }
}
