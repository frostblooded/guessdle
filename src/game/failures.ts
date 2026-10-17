// Every failure code the server sends: its HTTP status and the text the browser shows.
// One table so a new code cannot reach one side without the other.

import { MIN_ENTRIES } from "./limits.ts";

const failure = (status: number, text: string) => ({ status, text });

export const FAILURES = {
  invalid: failure(
    400,
    "One of the values is not allowed (empty, too long or the wrong format). Check what you entered and try again.",
  ),
  slug_immutable: failure(400, "A game's address cannot be changed."),
  reserved: failure(400, "That address is reserved. Pick another one."),
  unauthorized: failure(401, "Your session ended. Sign in again."),
  forbidden: failure(403, "You cannot change this game."),
  quota_exceeded: failure(403, "You have used all your upload space."),
  not_found: failure(404, "This game no longer exists."),
  too_few_entries: failure(
    409,
    `Add at least ${MIN_ENTRIES} entries before submitting.`,
  ),
  not_enough_entries: failure(
    409,
    `This game cannot be played yet: it needs at least ${MIN_ENTRIES} entries to pick a daily answer. Add entries in the editor.`,
  ),
  invalid_state: failure(
    409,
    "This game's status changed since you opened the page. Reload the page to see its current status.",
  ),
  attribute_exists: failure(409, "Another attribute already has that name."),
  entry_exists: failure(409, "Another entry already has that name."),
  slug_taken: failure(409, "That address is already taken. Pick another one."),
  self_deletion: failure(409, "You cannot delete your own account here."),
  last_admin: failure(409, "At least one admin must remain."),
  self_demotion: failure(409, "You cannot remove your own admin rights."),
  too_large: failure(413, "That image is over 5 MB."),
  unsupported: failure(415, "Use a JPEG, PNG or WebP image."),
  corrupt: failure(422, "That image could not be read."),
  rate_limited: failure(
    429,
    "Too many changes in a short time. Wait a minute and retry.",
  ),
} as const;

export type FailureCode = keyof typeof FAILURES;

// The text for a reply's `error` code; a 429 from anywhere else still reads as rate limiting
export const failureText = (code: unknown, status: number): string =>
  FAILURES[String(code) as FailureCode]?.text ??
  (status === 429
    ? FAILURES.rate_limited.text
    : "The server hit a problem and gave no details. Your change may not have been saved. Reload the page and check, then try again; if it keeps failing, try again in a few minutes.");
