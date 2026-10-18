// Every failure code the server sends: its HTTP status and the text the browser shows.
// One table so a new code cannot reach one side without the other.

import {
  MAX_OPEN_PARTIES,
  MAX_PLAYLIST_GAMES,
  MAX_PLAYLISTS,
  MAX_USERNAME,
  MIN_ENTRIES,
  MIN_USERNAME,
} from "./limits.ts";

const failure = (status: number, text: string) => ({ status, text });

export const FAILURES = {
  invalid: failure(
    400,
    "One of the values is not allowed (empty, too long or the wrong format). Check what you entered and try again.",
  ),
  missing_values: failure(
    400,
    "Fill in every attribute of the entry before saving it.",
  ),
  not_a_number: failure(
    400,
    "A number attribute takes a number, like 12, -3 or 4.5.",
  ),
  missing_order: failure(
    400,
    "Give the entry an image and pick the order of all nine squares before saving.",
  ),
  slug_immutable: failure(400, "A game's address cannot be changed."),
  reserved: failure(400, "That address is reserved. Pick another one."),
  unauthorized: failure(401, "Your session ended. Sign in again."),
  forbidden: failure(403, "You cannot change this game."),
  quota_exceeded: failure(403, "You have used all your upload space."),
  not_found: failure(404, "This game no longer exists."),
  no_such_day: failure(
    404,
    "This game has no puzzle for that day. Pick a day from the Past days list.",
  ),
  too_few_entries: failure(
    409,
    `Add at least ${MIN_ENTRIES} entries (one for a Blur game) before submitting.`,
  ),
  not_enough_entries: failure(
    409,
    `This game cannot be played yet: it needs at least ${MIN_ENTRIES} entries (one for a Blur game) to pick a daily answer. Use the Edit link to add entries.`,
  ),
  incomplete_entries: failure(
    409,
    "Some entries are missing values (in a Blur game, an image or its square order). Fill in every entry before submitting.",
  ),
  game_paused: failure(
    409,
    "This game is paused while some of its entries are missing values (in a Blur game, an image or its square order; in a Sequence game, until one entry has all its photos). It comes back once they are filled in.",
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
  party_not_found: failure(
    404,
    "There is no party with this code. Check the code and try again.",
  ),
  party_ended: failure(409, "This party has ended."),
  nickname_taken: failure(
    409,
    "Someone in this party already has that nickname. Pick another one.",
  ),
  party_full: failure(409, "This party is full."),
  too_many_parties: failure(
    409,
    `You already have ${MAX_OPEN_PARTIES} parties open. End one before starting another.`,
  ),
  invalid_username: failure(
    400,
    `A username is ${MIN_USERNAME} to ${MAX_USERNAME} lowercase letters, digits or underscores.`,
  ),
  username_taken: failure(
    409,
    "Someone already has that username. Pick another one.",
  ),
  username_set: failure(409, "You already picked a username."),
  username_required: failure(
    409,
    "Pick a username first: your playlists show on your profile under it.",
  ),
  playlist_not_found: failure(
    404,
    "This playlist does not exist, or its owner made it private.",
  ),
  too_many_playlists: failure(
    409,
    `You already have ${MAX_PLAYLISTS} playlists. Delete one before making another.`,
  ),
  playlist_full: failure(
    409,
    `This playlist already holds ${MAX_PLAYLIST_GAMES} games. Remove one before adding another.`,
  ),
  game_not_listed: failure(
    409,
    "Only games shown in the gallery can go in a playlist.",
  ),
  too_large: failure(413, "That image is over 5 MB."),
  unsupported: failure(415, "Use a JPEG, PNG or WebP image."),
  corrupt: failure(422, "That image could not be read."),
  forbidden_origin: failure(
    403,
    "The request came from an address this site does not accept. Reload the page from the site itself and try again.",
  ),
  unsupported_media_type: failure(
    415,
    "The browser sent data in a format the server does not accept. Reload the page and try again.",
  ),
  server_error: failure(
    500,
    "The server hit an unexpected problem. Reload the page and check whether it worked, then try again; if it keeps failing, wait a few minutes.",
  ),
  answer_missing: failure(
    500,
    "Today's answer could not be found for this game. Reload the page; if it keeps happening, ask the game owner or an admin to check the entries.",
  ),
  rate_limited: failure(
    429,
    "Too many changes in a short time. Wait a minute and retry.",
  ),
} as const;

export type FailureCode = keyof typeof FAILURES;

// The one text for a request that never got an answer (offline, DNS, server down, dropped)
export const UNREACHABLE =
  "Could not reach the server. Check your connection and try again; if your connection is fine, the server may be down, so try again in a few minutes.";

// The text for a reply's `error` code; a 429 from anywhere else still reads as rate limiting
export const failureText = (code: unknown, status: number): string =>
  FAILURES[String(code) as FailureCode]?.text ??
  (status === 429
    ? FAILURES.rate_limited.text
    : "The server answered with a problem it did not explain. Reload the page and check whether it worked, then try again; if it keeps failing, wait a few minutes.");
