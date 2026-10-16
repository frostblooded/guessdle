// Accounts and sessions: Google sign-in (Passport), opaque cookie sessions in
// Postgres, and the CSRF guard for mutating endpoints.
import { createHash, randomBytes } from "node:crypto";
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
}

export interface GoogleConfig {
  clientID: string;
  clientSecret: string;
  callbackURL: string;
}

// The part of a Passport Google profile the sign-in rule reads
export interface GoogleProfile {
  id: string;
  displayName?: string;
  emails?: { value: string; verified?: unknown }[];
}

// Only Google accounts whose email Google has verified may sign in
export function isVerifiedGoogleProfile(profile: GoogleProfile): boolean {
  const email = profile.emails?.[0];
  return profile.id !== "" && !!email?.value && email.verified === true;
}

export function adminEmailsFromEnv(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter((email) => email !== "");
}

export function googleConfigFromEnv(
  env: Record<string, string | undefined>,
): GoogleConfig | undefined {
  const clientID = env["GOOGLE_CLIENT_ID"];
  const clientSecret = env["GOOGLE_CLIENT_SECRET"];
  const callbackURL = env["GOOGLE_CALLBACK_URL"];
  return clientID && clientSecret && callbackURL
    ? { clientID, clientSecret, callbackURL }
    : undefined;
}

// Creates or updates the user for a Google subject; an email on the admin list
// promotes, nothing here demotes.
export async function upsertUser(
  pool: pg.Pool,
  sub: string,
  email: string,
  name: string,
  makeAdmin: boolean,
): Promise<SessionUser> {
  const { rows } = await pool.query<SessionUser>(
    `insert into users (google_sub, email, name, admin) values ($1, $2, $3, $4)
     on conflict (google_sub) do update
       set email = excluded.email, name = excluded.name, admin = users.admin or excluded.admin
     returning id::int, name, email, admin`,
    [sub, email, name, makeAdmin],
  );
  return rows[0]!;
}

// Passport's verify callback: hands Passport the user, false when refused, or an error
export function googleVerify(pool: pg.Pool, adminEmails: readonly string[]) {
  return (
    _accessToken: string,
    _refreshToken: string,
    profile: GoogleProfile,
    done: (err: unknown, user?: SessionUser | false) => void,
  ): void => {
    if (!isVerifiedGoogleProfile(profile)) {
      done(null, false);
      return;
    }
    const email = profile.emails![0]!.value;
    upsertUser(
      pool,
      profile.id,
      email,
      profile.displayName || email,
      adminEmails.includes(email.toLowerCase()),
    ).then(
      (user) => done(null, user),
      (err: unknown) => done(err),
    );
  };
}

const hash = (token: string): string =>
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
     returning u.id::int, u.name, u.email, u.admin`,
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

export function sessionToken(req: Request): string | undefined {
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

// CSRF defence with SameSite=Lax: mutating requests must be JSON (a cross-site
// form or simple request cannot be) and any Origin must be this site.
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
  if (!/^application\/json\s*(;|$)/i.test(req.headers["content-type"] ?? "")) {
    res.status(415).json({ error: "unsupported_media_type" });
    return;
  }
  next();
}
