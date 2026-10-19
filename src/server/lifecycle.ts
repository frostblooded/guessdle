// The game status lifecycle (spec #66): which edits send a game back to pending, the guarded
// moves (submit, unpublish, approve, reject), the admin email on entering pending and the
// owner's approval emails (owner-mail.ts).
import type pg from "pg";
import { playBlocker } from "./access.ts";
import { loadRoster, type GameRow, type GameStatus } from "./games.ts";
import type { OwnerMailKind } from "../mail-settings.ts";
import type { MailConfig } from "./mailer.ts";
import { mailOwner, type OwnerNotice } from "./owner-mail.ts";
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

// The owner email a status change sends: an admin's verdict, or an edit that took an
// approved game out of the gallery. Submitting and unpublishing are the owner's own doing.
export function ownerMailFor(
  move: Move | "edit",
  before: GameStatus,
  after: GameStatus,
): OwnerMailKind | undefined {
  if (move === "approve" && after === "approved") {
    return "approved";
  }
  if (move === "reject" && after === "rejected") {
    return "rejected";
  }
  return move === "edit" && before === "approved" && after === "pending"
    ? "review"
    : undefined;
}

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

export type MoveResult =
  "ok" | "invalid_state" | "too_few_entries" | "incomplete_entries";
// What to mail once the transaction commits
interface Mails {
  admins: { slug: string; name: string } | undefined;
  owner: OwnerNotice | undefined;
}
const NO_MAILS: Mails = { admins: undefined, owner: undefined };
interface Settled {
  result: MoveResult;
  mails: Mails;
}

// Every status change goes through here, so none can forget the admin or owner email.
export function gameLifecycle(pool: pg.Pool, mail?: MailConfig) {
  // Runs under the game lock; sets the new status and returns what to mail about
  const settle = async (
    tx: pg.PoolClient,
    game: GameRow,
    move: Move | "edit",
    before: GameStatus,
    after: GameStatus,
    reason: string | null = null,
  ): Promise<Mails> => {
    const { rows } = await tx.query<{
      slug: string;
      name: string;
      reason: string;
    }>(
      `update games set status = $2, reject_reason = coalesce($3, reject_reason), updated_at = now()
       where id = $1 returning slug, name, reject_reason as reason`,
      [game.id, after, reason],
    );
    const row = rows[0];
    const kind = ownerMailFor(move, before, after);
    return {
      admins: row && enteredPending(before, after) ? row : undefined,
      owner: row && kind ? { kind, gameId: game.id, ...row } : undefined,
    };
  };
  const mailIf = async ({ admins, owner }: Mails) => {
    if (!mail) {
      return;
    }
    if (admins) {
      await mailAdminsPending(pool, mail, admins);
    }
    if (owner) {
      await mailOwner(pool, mail, owner);
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
      const { result, mails } = await withGameLock(
        pool,
        game.id,
        async (tx, before) => {
          const result = await work(tx);
          const mails = isEdit(result)
            ? await settle(
                tx,
                game,
                "edit",
                before,
                statusAfterEdit(before, kind),
              )
            : NO_MAILS;
          return { result, mails };
        },
      );
      await mailIf(mails);
      return result;
    },

    async move(
      game: GameRow,
      move: Move,
      reason: string = "",
    ): Promise<MoveResult> {
      const { result, mails } = await withGameLock(
        pool,
        game.id,
        async (tx, before): Promise<Settled> => {
          const after = moveTarget(move, before);
          if (!after) {
            return { result: "invalid_state", mails: NO_MAILS };
          }
          if (move === "submit") {
            // The roster as of the lock, so a concurrent edit cannot slip past
            const blocker = playBlocker(await loadRoster(tx, game));
            if (blocker) {
              return {
                result:
                  blocker === "not_enough_entries"
                    ? "too_few_entries"
                    : "incomplete_entries",
                mails: NO_MAILS,
              };
            }
          }
          // Submit keeps the last rejection reason; the others set it (cleared unless rejecting)
          const mails = await settle(
            tx,
            game,
            move,
            before,
            after,
            move === "submit" ? null : reason,
          );
          return { result: "ok", mails };
        },
      );
      await mailIf(mails);
      return result;
    },
  };
}
