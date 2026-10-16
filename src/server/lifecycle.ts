// The game status lifecycle (spec #66): which edits send a game back to pending, the guarded
// moves (submit, unpublish, approve, reject) and the admin email on entering pending.
import type pg from "pg";
import { MIN_ENTRIES } from "../game/limits.ts";
import { type GameRow, type GameStatus } from "./games.ts";
import type { MailConfig } from "./mailer.ts";
import { withGameLock } from "./tx.ts";

type Q = Pick<pg.Pool, "query">;

export type EditKind =
  "details" | "cover" | "attributes" | "entries" | "skip-period";

// Which edit kinds send an approved or rejected game back to pending
export const RESETS_STATUS: Record<EditKind, boolean> = {
  details: true,
  cover: true,
  attributes: true,
  entries: true,
  "skip-period": false,
};

export const statusAfterEdit = (
  status: GameStatus,
  kind: EditKind,
): GameStatus =>
  RESETS_STATUS[kind] && (status === "approved" || status === "rejected")
    ? "pending"
    : status;

export type Move = "submit" | "unpublish" | "approve" | "reject";

const MOVES: Record<Move, { from: GameStatus[]; to: GameStatus }> = {
  submit: { from: ["draft", "rejected"], to: "pending" },
  unpublish: { from: ["approved"], to: "pending" },
  approve: { from: ["pending"], to: "approved" },
  reject: { from: ["pending"], to: "rejected" },
};

// The status a move leads to, undefined when the game is not in a state it applies to
export const moveTarget = (
  move: Move,
  status: GameStatus,
): GameStatus | undefined =>
  MOVES[move].from.includes(status) ? MOVES[move].to : undefined;

export const enteredPending = (
  before: GameStatus,
  after: GameStatus,
): boolean => after === "pending" && before !== "pending";

// Mails every admin that `game` entered pending. Never throws: a mail problem must not fail the edit.
async function mailAdminsPending(
  q: Q,
  mail: MailConfig,
  game: { slug: string; name: string },
): Promise<void> {
  try {
    const { rows } = await q.query<{ email: string }>(
      "select email from users where admin",
    );
    const text = `The game "${game.name}" is waiting for approval.\n\nPlay it: ${mail.publicUrl}/g/${game.slug}\nReview it: ${mail.publicUrl}/admin\n`;
    const subject = `Guessdle: "${game.name}" is waiting for approval`;
    await Promise.all(
      rows.map(({ email }) => mail.mailer.send({ to: email, subject, text })),
    );
  } catch (err) {
    console.error("Could not mail the admins", err);
  }
}

export type MoveResult = "ok" | "invalid_state" | "too_few_entries";
interface Settled {
  result: MoveResult;
  row: { slug: string; name: string } | undefined;
}

// Every status change goes through here, so none can forget the admin email.
export function gameLifecycle(pool: pg.Pool, mail?: MailConfig) {
  // Runs under the game lock; sets the new status and returns the row to mail about, if any
  const settle = async (
    tx: pg.PoolClient,
    game: GameRow,
    before: GameStatus,
    after: GameStatus,
    reason: string | null = null,
  ) => {
    const { rows } = await tx.query<{ slug: string; name: string }>(
      `update games set status = $2, reject_reason = coalesce($3, reject_reason), updated_at = now()
       where id = $1 returning slug, name`,
      [game.id, after, reason],
    );
    return enteredPending(before, after) ? rows[0] : undefined;
  };
  const mailIf = async (row: { slug: string; name: string } | undefined) => {
    if (row && mail) {
      await mailAdminsPending(pool, mail, row);
    }
  };

  return {
    // Runs `work` (the data change) in the game's transaction; when `isEdit(result)`, applies
    // the kind's status rule and mails the admins if that put the game into pending.
    async edit<T>(
      game: GameRow,
      kind: EditKind,
      work: (tx: pg.PoolClient) => Promise<T>,
      isEdit: (result: T) => boolean = () => true,
    ): Promise<T> {
      const { result, row } = await withGameLock(
        pool,
        game.id,
        async (tx, before) => {
          const result = await work(tx);
          const row = isEdit(result)
            ? await settle(tx, game, before, statusAfterEdit(before, kind))
            : undefined;
          return { result, row };
        },
      );
      await mailIf(row);
      return result;
    },

    async move(
      game: GameRow,
      move: Move,
      reason: string = "",
    ): Promise<MoveResult> {
      const { result, row } = await withGameLock(
        pool,
        game.id,
        async (tx, before): Promise<Settled> => {
          const after = moveTarget(move, before);
          if (!after) {
            return { result: "invalid_state", row: undefined };
          }
          if (move === "submit") {
            const { rows } = await tx.query<{ n: number }>(
              "select count(*)::int as n from entries where game_id = $1 and deleted_at is null",
              [game.id],
            );
            if (rows[0]!.n < MIN_ENTRIES) {
              return { result: "too_few_entries", row: undefined };
            }
          }
          // Submit keeps the last rejection reason; the others set it (cleared unless rejecting)
          const row = await settle(
            tx,
            game,
            before,
            after,
            move === "submit" ? null : reason,
          );
          return { result: "ok", row };
        },
      );
      await mailIf(row);
      return result;
    },
  };
}
