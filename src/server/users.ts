// Admin user management: list users, promote and demote with lock-out guards.
import type pg from "pg";

export interface AdminUser {
  id: number;
  name: string;
  email: string;
  lastSeen: string;
  admin: boolean;
}

const LOCK_KEY = 48_002;

export async function listUsers(pool: pg.Pool): Promise<AdminUser[]> {
  const { rows } = await pool.query<AdminUser>(
    `select id::int, name, email, last_seen as "lastSeen", admin
     from users order by lower(name), id`,
  );
  return rows;
}

export type SetAdminResult = "ok" | "not_found" | "self" | "last_admin";

// Demotions serialise on an advisory lock, so two admins demoting each other
// at once cannot both pass the last-admin check.
export async function setAdmin(
  pool: pg.Pool,
  actorId: number,
  targetId: number,
  admin: boolean,
): Promise<SetAdminResult> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query("select pg_advisory_xact_lock($1)", [LOCK_KEY]);
    let result: SetAdminResult = "ok";
    if (!admin && actorId === targetId) {
      result = "self";
    } else if (
      !admin &&
      (
        await client.query(
          "select 1 from users where admin and id <> $1 limit 1",
          [targetId],
        )
      ).rowCount === 0
    ) {
      result = "last_admin";
    } else if (
      (
        await client.query("update users set admin = $2 where id = $1", [
          targetId,
          admin,
        ])
      ).rowCount === 0
    ) {
      result = "not_found";
    }
    await client.query("commit");
    return result;
  } catch (err) {
    await client.query("rollback").catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

// Deletes the user (their games, state and upload rows cascade). Returns the upload URLs to unlink:
// every file they own plus the covers and photos of their games.
export async function deleteUser(
  pool: pg.Pool,
  actorId: number,
  targetId: number,
): Promise<{ result: "ok" | "not_found" | "self"; urls: string[] }> {
  if (actorId === targetId) {
    return { result: "self", urls: [] };
  }
  const { rows } = await pool.query<{ url: string }>(
    `select '/uploads/' || name as url from uploads where user_id = $1
     union select cover_url from games where owner_id = $1
     union select e.photo_url from entries e join games g on g.id = e.game_id where g.owner_id = $1`,
    [targetId],
  );
  const { rowCount } = await pool.query("delete from users where id = $1", [
    targetId,
  ]);
  return rowCount === 1
    ? { result: "ok", urls: rows.map((r) => r.url) }
    : { result: "not_found", urls: [] };
}
