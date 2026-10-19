// Magic-link sign-in: normalised emails, hashed single-use tokens, per-email limits.
import { randomBytes } from "node:crypto";
import type pg from "pg";
import { hash } from "./auth.ts";
import type { Mailer } from "./mailer.ts";

export const TOKEN_MINUTES = 15;
export const MAX_EMAIL_LENGTH = 254;
export const MAX_TOKEN_LENGTH = 200;
const MINUTE_MS = 60_000;
const PER_HOUR = 5;
// Login mails per hour across all addresses: caps what one sender can spray
export const SITE_PER_HOUR = 100;
// Rows outlive their expiry this long: the hourly limit counts them
const KEEP_MS = 2 * 60 * MINUTE_MS;

// Trimmed lowercase email, or null when it is not plausibly one
export function normalizeEmail(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const email = value.trim().toLowerCase();
  return email.length <= MAX_EMAIL_LENGTH &&
    /^[^\s@<>(),;:"\\]+@[^\s@<>(),;:"\\]+\.[^\s@<>(),;:"\\]+$/.test(email)
    ? email
    : null;
}

// Mails a link unless this address asked too recently (1/minute, 5/hour) or the
// site sent SITE_PER_HOUR this hour; the caller answers the same either way.
// Sending errors propagate after dropping the token, so a retry is not limited.
export async function requestLoginLink(
  pool: pg.Pool,
  mailer: Mailer,
  publicUrl: string,
  email: string,
  now: Date,
): Promise<void> {
  const time = now.getTime();
  await pool.query("delete from login_tokens where expires_at < $1", [
    new Date(time - KEEP_MS),
  ]);
  const { rows } = await pool.query<{
    minute: number;
    hour: number;
    site: number;
  }>(
    `select count(*) filter (where email = $1 and created_at > $2)::int as minute,
       count(*) filter (where email = $1)::int as hour, count(*)::int as site
     from login_tokens where created_at > $3`,
    [email, new Date(time - MINUTE_MS), new Date(time - 60 * MINUTE_MS)],
  );
  const { minute, hour, site } = rows[0]!;
  if (minute >= 1 || hour >= PER_HOUR || site >= SITE_PER_HOUR) {
    return;
  }
  const token = randomBytes(32).toString("base64url");
  const tokenHash = hash(token);
  await pool.query(
    "insert into login_tokens (token_hash, email, expires_at, created_at) values ($1, $2, $3, $4)",
    [tokenHash, email, new Date(time + TOKEN_MINUTES * MINUTE_MS), now],
  );
  try {
    await mailer.send({
      to: email,
      subject: "Your Guessdle sign-in link",
      text: `Open this link to sign in to Guessdle:\n\n${publicUrl}/verify?token=${token}\n\nIt works once and expires in ${TOKEN_MINUTES} minutes. If you did not ask for it, ignore this email.\n`,
    });
  } catch (err) {
    await pool.query("delete from login_tokens where token_hash = $1", [
      tokenHash,
    ]);
    throw err;
  }
}

// The token's email once, atomically; null when unknown, expired or already used
export async function consumeLoginToken(
  pool: pg.Pool,
  token: string,
  now: Date,
): Promise<string | null> {
  const { rows } = await pool.query<{ email: string }>(
    `update login_tokens set used_at = $2
     where token_hash = $1 and used_at is null and expires_at > $2 returning email`,
    [hash(token), now],
  );
  return rows[0]?.email ?? null;
}
