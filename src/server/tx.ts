import type pg from "pg";
import type { GameStatus } from "./games.ts";

export async function withGameLock<T>(
  pool: pg.Pool,
  gameId: number,
  work: (tx: pg.PoolClient, status: GameStatus) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    const { rows } = await client.query<{ status: GameStatus }>(
      "select status from games where id = $1 for update",
      [gameId],
    );
    const out = await work(client, rows[0]!.status);
    await client.query("commit");
    return out;
  } catch (err) {
    await client.query("rollback");
    throw err;
  } finally {
    client.release();
  }
}
