import type pg from "pg";

type Q = Pick<pg.Pool, "query">;

const STATE_TABLES = ["user_guesses", "user_give_ups", "user_hints"] as const;

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
