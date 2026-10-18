// Accounts and sessions: opaque cookie sessions in Postgres, the admin email list and the CSRF guard for mutating endpoints.
import { createHash, randomBytes } from "node:crypto";
import type { IncomingMessage } from "node:http";
import type { NextFunction, Request, Response } from "express";
import type pg from "pg";

export const SESSION_COOKIE = "sid";
export const SESSION_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface SessionUser {
  id: number;
  name: string;
  email: string;
  admin: boolean;
  // Banned by an admin: still signs in and plays, but cannot create or change games
  banned: boolean;
  banReason: string;
}

export function adminEmailsFromEnv(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter((email) => email !== "");
}

// Finds or creates the user for an email (case-insensitive, so Google-era rows
// match); an email on the admin list promotes, nothing here demotes.
export async function upsertUser(
  pool: pg.Pool,
  email: string,
  name: string,
  makeAdmin: boolean,
): Promise<SessionUser> {
  const { rows } = await pool.query<SessionUser>(
    `insert into users (email, name, admin) values (lower($1), $2, $3)
     on conflict (lower(email)) do update set admin = users.admin or excluded.admin
     returning id::int, name, email, admin, banned_at is not null as banned, ban_reason as "banReason"`,
    [email, name, makeAdmin],
  );
  return rows[0]!;
}

export const hash = (token: string): string =>
  createHash("sha256").update(token).digest("hex");

// Returns the cookie token; only its hash is stored
export async function startSession(
  pool: pg.Pool,
  userId: number,
  now: Date,
): Promise<string> {
  // Expired rows are dead weight; purge them on each login
  await pool.query("delete from sessions where expires_at <= $1", [now]);
  const token = randomBytes(32).toString("base64url");
  await pool.query(
    "insert into sessions (token_hash, user_id, expires_at) values ($1, $2, $3)",
    [hash(token), userId, new Date(now.getTime() + SESSION_DAYS * DAY_MS)],
  );
  return token;
}

// The signed-in user, or null. A hit rolls the expiry and stamps last seen.
export async function userForSession(
  pool: pg.Pool,
  token: string | undefined,
  now: Date,
): Promise<SessionUser | null> {
  if (!token) {
    return null;
  }
  const { rows } = await pool.query<SessionUser>(
    `with s as (
       update sessions set expires_at = $2 where token_hash = $1 and expires_at > $3 returning user_id
     )
     update users u set last_seen = $3 from s where u.id = s.user_id
     returning u.id::int, u.name, u.email, u.admin, u.banned_at is not null as banned,
       u.ban_reason as "banReason"`,
    [hash(token), new Date(now.getTime() + SESSION_DAYS * DAY_MS), now],
  );
  return rows[0] ?? null;
}

// One lookup per request (the rate limiter and the route share it): each lookup rolls the expiry
const lookups = new WeakMap<Request, Promise<SessionUser | null>>();
export function requestUser(
  pool: pg.Pool,
  req: Request,
  now: Date,
): Promise<SessionUser | null> {
  let user = lookups.get(req);
  if (!user) {
    user = userForSession(pool, sessionToken(req), now);
    lookups.set(req, user);
  }
  return user;
}

export async function endSession(
  pool: pg.Pool,
  token: string | undefined,
): Promise<void> {
  if (token) {
    await pool.query("delete from sessions where token_hash = $1", [
      hash(token),
    ]);
  }
}

export function sessionToken(
  req: Pick<IncomingMessage, "headers">,
): string | undefined {
  return /(?:^|;\s*)sid=([^;]+)/.exec(req.headers.cookie ?? "")?.[1];
}

export function setSessionCookie(
  res: Response,
  token: string,
  secure: boolean,
): void {
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge: SESSION_DAYS * DAY_MS,
  });
}

export function clearSessionCookie(res: Response, secure: boolean): void {
  res.clearCookie(SESSION_COOKIE, {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
  });
}

// CSRF defence with SameSite=Lax: mutating requests must be JSON or raw bytes
// (uploads); a cross-site form or simple request can be neither and any Origin must be this site.
export function csrfGuard(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) {
    next();
    return;
  }
  const origin = req.headers.origin;
  if (origin !== undefined) {
    let host: string | null = null;
    try {
      host = new URL(origin).host;
    } catch {
      // unparsable: mismatched below
    }
    if (host === null || host !== req.headers.host) {
      res.status(403).json({ error: "forbidden_origin" });
      return;
    }
  }
  if (
    !/^application\/(json|octet-stream)\s*(;|$)/i.test(
      req.headers["content-type"] ?? "",
    )
  ) {
    res.status(415).json({ error: "unsupported_media_type" });
    return;
  }
  next();
}
