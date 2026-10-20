// A signed-in player's Game State for one day, stored in Postgres.
import type pg from "pg";
import {
  isHintKind,
  pickHint,
  revealHint,
  type FreeHint,
  type HintChoices,
  type HintPick,
} from "../game/free-hint.ts";
import { SKIP, type GradedAttribute } from "../game/game.ts";
import type { FailureCode } from "../game/failures.ts";
import { isImageGame } from "../game/blur.ts";
import type { GameRow, Roster } from "./games.ts";
import { boardOf, isLost, triesOf, type PlayDay } from "./play-day.ts";
import { recordFailure } from "./results.ts";

export interface GameView {
  day: number;
  // The answer's revision: a changed one means the day started over (migration 018)
  revision: number;
  ids: number[];
  rows: GradedAttribute[][];
  victory: boolean;
  gaveUp: boolean;
  // Blur and Sequence games: every try was used without finding the answer
  lost?: true;
  // The answer's name: present once the day is over (victory, give-up or lost)
  answer?: string;
  // Blur games, once the day is over: the answer's whole image
  answerPhoto?: string;
  // Once the day is over, when the answer has one
  answerDescription?: string;
  // Classic games: the Free Hint the player used
  hint?: FreeHint;
  // Classic games: the hint kinds on offer, while the day is on and no hint was used
  hints?: HintChoices;
}

// An id a player may guess: an active entry, or in a Blur or Sequence game SKIP
const isGuessId = (game: GameRow, roster: Roster, id: unknown): boolean =>
  (id === SKIP && isImageGame(game.kind)) ||
  roster.entries.some((e) => e.id === id);

// Why a change is refused; statuses and texts live in FAILURES.
// has_progress, stale_day: merge only (the account already has rows for the day; the
// payload is for another day or an answer since changed). no_hint: none on offer.
export type Refusal = Extract<
  FailureCode,
  | "invalid"
  | "duplicate"
  | "finished"
  | "has_progress"
  | "stale_day"
  | "no_hint"
>;
export type GameOutcome = { kind: "ok"; view: GameView } | { kind: Refusal };

type Q = Pick<pg.Pool, "query">;

// Who is playing which Day of play
export interface GameContext extends PlayDay {
  userId: number;
}

// Graded on read against the current answer, so an overridden answer applies at once
export async function view(q: Q, ctx: GameContext): Promise<GameView> {
  const { game, userId, date, day } = ctx;
  const guesses = await q.query<{ entry_id: number }>(
    // A skip is stored with no entry (migration 011)
    `select coalesce(entry_id, ${SKIP})::int as entry_id from user_guesses
     where user_id = $1 and game_id = $2 and day = $3 order by seq`,
    [userId, game.id, date],
  );
  const gaveUp =
    (
      await q.query(
        "select 1 from user_give_ups where user_id = $1 and game_id = $2 and day = $3",
        [userId, game.id, date],
      )
    ).rowCount === 1;
  const ids = guesses.rows.map((row) => row.entry_id);
  const board = boardOf(ctx, ids, gaveUp);
  if (typeof board === "string") {
    // Stored rows are never duplicated
    throw new Error("stored guesses are not gradable");
  }
  const pick = await storedHint(q, userId, game.id, date);
  const hint = pick && revealHint(ctx.roster.attributes, ctx.answer, pick);
  return {
    day,
    revision: ctx.revision,
    ids,
    rows: board.rows,
    victory: board.victory,
    gaveUp,
    ...(board.lost && { lost: true as const }),
    ...board.reveal,
    ...(hint && { hint }),
    ...(!hint && board.hints && { hints: board.hints }),
  };
}

// Whole seconds from the board's first stored guess to its last; null when a guess has no time
export async function boardSeconds(
  q: Q,
  { game, userId, date }: GameContext,
): Promise<number | null> {
  const { rows } = await q.query<{ seconds: number | null }>(
    `select case when count(*) > 0 and count(guessed_at) = count(*)
       then round(extract(epoch from max(guessed_at) - min(guessed_at)))::int end as seconds
     from user_guesses where user_id = $1 and game_id = $2 and day = $3`,
    [userId, game.id, date],
  );
  return rows[0]?.seconds ?? null;
}

async function storedHint(
  q: Q,
  userId: number,
  gameId: number,
  date: string,
): Promise<HintPick | null> {
  const { rows } = await q.query<{ attribute: string }>(
    "select attribute from user_hints where user_id = $1 and game_id = $2 and day = $3",
    [userId, gameId, date],
  );
  const row = rows[0];
  return row ? { kind: "attribute", attribute: row.attribute } : null;
}

// Runs `action` in a transaction holding the user's row lock, so one player's
// concurrent requests are applied one at a time.
export async function changeGame(
  pool: pg.Pool,
  ctx: GameContext,
  action: (current: GameView, q: Q) => Promise<Refusal | null>,
): Promise<GameOutcome> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query("select 1 from users where id = $1 for update", [
      ctx.userId,
    ]);
    const current = await view(client, ctx);
    const refusal = await action(current, client);
    if (refusal !== null) {
      await client.query("rollback");
      return { kind: refusal };
    }
    const next = await view(client, ctx);
    await client.query("commit");
    return { kind: "ok", view: next };
  } catch (err) {
    await client.query("rollback");
    throw err;
  } finally {
    client.release();
  }
}

const finished = (current: GameView): boolean =>
  current.victory || current.gaveUp || current.lost === true;

// A failed attempt takes the account's one result for the day, if it is the first attempt
const failed = (q: Q, { game, userId, date }: GameContext, guesses: number) =>
  recordFailure(
    q,
    { gameId: game.id, date, player: `user:${userId}` },
    guesses,
  );

export async function addGuess(
  q: Q,
  ctx: GameContext,
  current: GameView,
  id: unknown,
): Promise<Refusal | null> {
  const { game, roster, userId, date, answer } = ctx;
  if (typeof id !== "number" || !isGuessId(game, roster, id)) {
    return "invalid";
  }
  if (finished(current)) {
    return "finished";
  }
  const { rowCount } = await q.query(
    "insert into user_guesses (user_id, game_id, day, entry_id) values ($1, $2, $3, $4) on conflict do nothing",
    [userId, game.id, date, id === SKIP ? null : id],
  );
  if (rowCount !== 1) {
    return "duplicate";
  }
  const ids = [...current.ids, id];
  if (isLost(game, ids, id === answer.id)) {
    await failed(q, ctx, ids.length);
  }
  return null;
}

export async function giveUp(
  q: Q,
  ctx: GameContext,
  current: GameView,
): Promise<Refusal | null> {
  if (finished(current)) {
    return "finished";
  }
  const { game, userId, date } = ctx;
  await q.query(
    "insert into user_give_ups (user_id, game_id, day) values ($1, $2, $3)",
    [userId, game.id, date],
  );
  await failed(q, ctx, current.ids.length);
  return null;
}

// Uses the day's Free Hint: draws it and stores the pick
export async function takeHint(
  q: Q,
  { game, roster, answer, userId, date }: GameContext,
  current: GameView,
  kind: unknown,
  random: () => number,
): Promise<Refusal | null> {
  if (!isHintKind(kind)) {
    return "invalid";
  }
  if (!current.hints) {
    return "no_hint";
  }
  const pick = pickHint(roster.attributes, answer, current.rows, kind, random);
  if (!pick) {
    return "no_hint";
  }
  // A stored hint whose attribute was since renamed shows nothing, but it was still taken
  const { rowCount } = await q.query(
    "insert into user_hints (user_id, game_id, day, kind, attribute) values ($1, $2, $3, $4, $5) on conflict do nothing",
    [userId, game.id, date, pick.kind, pick.attribute],
  );
  return rowCount === 0 ? "no_hint" : null;
}

// Adopts anonymous local history (POST /api/games/:slug/state/merge body); the user-row lock
// in changeGame makes the "no rows yet" check and the inserts one atomic step.
export async function mergeLocal(
  q: Q,
  ctx: GameContext,
  current: GameView,
  body: Record<string, unknown>,
): Promise<Refusal | null> {
  const { game, roster, answer, userId, date, day, revision } = ctx;
  const { ids, gaveUp } = body;
  if (
    !Array.isArray(ids) ||
    ids.length > (triesOf(game) ?? roster.entries.length) ||
    !ids.every((id) => isGuessId(game, roster, id)) ||
    (gaveUp !== undefined && typeof gaveUp !== "boolean")
  ) {
    return "invalid";
  }
  // Browsers from before revisions existed send none: they played revision 0
  if (body["day"] !== day || (body["revision"] ?? 0) !== revision) {
    return "stale_day";
  }
  if (current.ids.length > 0 || current.gaveUp) {
    return "has_progress";
  }
  // Keep first occurrences (and every skip) in order, stop after the answer
  const keep = (ids as number[]).filter(
    (id, i) => id === SKIP || ids.indexOf(id) === i,
  );
  const end = keep.indexOf(answer.id);
  const adopted = (end === -1 ? keep : keep.slice(0, end + 1)).slice(
    0,
    triesOf(game) ?? undefined,
  );
  for (const id of adopted) {
    await q.query(
      // No guess time: these guesses were made in the browser, which timed them
      "insert into user_guesses (user_id, game_id, day, entry_id, guessed_at) values ($1, $2, $3, $4, null)",
      [userId, game.id, date, id === SKIP ? null : id],
    );
  }
  const lost = end === -1 && isLost(game, adopted, false);
  if (gaveUp === true && end === -1 && !lost) {
    await q.query(
      "insert into user_give_ups (user_id, game_id, day) values ($1, $2, $3)",
      [userId, game.id, date],
    );
  }
  // The browser's attempt failed: it was the account's first one today
  if (lost || (gaveUp === true && end === -1)) {
    await failed(q, ctx, adopted.length);
  }
  return null;
}

export async function resetGame(
  q: Q,
  { game, userId, date }: GameContext,
): Promise<Refusal | null> {
  // Any time, even with no rows: deleting nothing is fine
  for (const table of ["user_guesses", "user_give_ups", "user_hints"]) {
    await q.query(
      `delete from ${table} where user_id = $1 and game_id = $2 and day = $3`,
      [userId, game.id, date],
    );
  }
  return null;
}
