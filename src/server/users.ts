// Admin user management: list users, promote and demote with lock-out guards, ban and unban.
import type pg from "pg";
import type { UploadRefs } from "./upload-refs.ts";

export interface AdminUser {
  id: number;
  name: string;
  email: string;
  lastSeen: string;
  admin: boolean;
  banned: boolean;
  banReason: string;
}

const LOCK_KEY = 48_002;

export async function listUsers(pool: pg.Pool): Promise<AdminUser[]> {
  const { rows } = await pool.query<AdminUser>(
    `select id::int, name, email, last_seen as "lastSeen", admin,
       banned_at is not null as banned, ban_reason as "banReason"
     from users order by lower(name), id`,
  );
  return rows;
}

export type SetAdminResult =
  "ok" | "not_found" | "self_demotion" | "last_admin" | "promote_banned";

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
      result = "self_demotion";
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
      admin &&
      (
        await client.query(
          "select 1 from users where id = $1 and banned_at is not null",
          [targetId],
        )
      ).rowCount !== 0
    ) {
      result = "promote_banned";
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

// Deletes the user (their games, state and uploads go with them, see upload-refs.ts)
export async function deleteUser(
  refs: UploadRefs,
  actorId: number,
  targetId: number,
): Promise<"ok" | "not_found" | "self_deletion"> {
  if (actorId === targetId) {
    return "self_deletion";
  }
  return (await refs.dropUser(targetId)) ? "ok" : "not_found";
}

export type SetBanResult = "ok" | "not_found" | "self_ban" | "admin_ban";

// Bans the user with `reason`, or unbans them when it is null. Admins cannot be banned, so a ban
// takes the same lock as promotions: a player cannot be promoted and banned at once.
export async function setBan(
  pool: pg.Pool,
  actorId: number,
  targetId: number,
  reason: string | null,
  now: Date,
): Promise<SetBanResult> {
  if (actorId === targetId) {
    return "self_ban";
  }
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query("select pg_advisory_xact_lock($1)", [LOCK_KEY]);
    const { rows } = await client.query<{ admin: boolean }>(
      "select admin from users where id = $1",
      [targetId],
    );
    let result: SetBanResult = "ok";
    if (rows.length === 0) {
      result = "not_found";
    } else if (rows[0]!.admin && reason !== null) {
      result = "admin_ban";
    } else {
      await client.query(
        "update users set banned_at = $2, ban_reason = $3 where id = $1",
        [targetId, reason === null ? null : now, reason ?? ""],
      );
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
