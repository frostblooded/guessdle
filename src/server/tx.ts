// One transaction shape for game edits: begin, lock the game row, run, commit; rollback on a throw.
import type pg from "pg";
import type { GameStatus } from "./games.ts";

// `work` gets the client and the game's status as read under the lock (never stale).
// Returning normally commits, so a refusal must happen before `work` writes anything.
export async function withGameLock<T>(
  pool: pg.Pool,
  gameId: number,
  work: (tx: pg.PoolClient, status: GameStatus) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    // Serializes edits of one game so name checks, caps and status moves hold
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
