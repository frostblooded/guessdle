import type pg from "pg";
import { playBlocker } from "./access.ts";
import { saveSnapshot } from "./approval.ts";
import { loadRoster, type GameRow, type GameStatus } from "./games.ts";
import type { OwnerMailKind } from "../game/mail-settings.ts";
import type { MailConfig } from "./mailer.ts";
import { mailOwner, type OwnerNotice } from "./owner-mail.ts";
import { withGameLock } from "./tx.ts";

type Q = Pick<pg.Pool, "query">;

export type EditKind =
  "details" | "cover" | "attributes" | "entries" | "skip-period";

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

export const moveTarget = (
  move: Move,
  status: GameStatus,
): GameStatus | undefined =>
  MOVES[move].from.includes(status) ? MOVES[move].to : undefined;

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

export const ADMIN_MAIL_DELAY = "5 minutes";

export async function mailDueAdmins(
  q: Q,
  mail: MailConfig,
  at: Date = new Date(),
): Promise<void> {
  try {
    const { rows: games } = await q.query<{ slug: string; name: string }>(
      `update games set admin_mail_at = null
       where status = 'pending' and admin_mail_at <= $1 returning slug, name`,
      [at],
    );
    if (games.length === 0) {
      return;
    }
    const { rows } = await q.query<{ email: string }>(
      "select email from users where admin",
    );
    for (const game of games) {
      const text = `The game "${game.name}" is waiting for approval.\n\nPlay it: ${mail.publicUrl}/g/${game.slug}\nReview it: ${mail.publicUrl}/admin\n`;
      const subject = `Guessdle: "${game.name}" is waiting for approval`;
      await Promise.all(
        rows.map(({ email }) => mail.mailer.send({ to: email, subject, text })),
      );
    }
  } catch (err) {
    console.error("Could not mail the admins", err);
  }
}

export type MoveResult =
  "ok" | "invalid_state" | "too_few_entries" | "incomplete_entries";
interface Mails {
  owner: OwnerNotice | undefined;
}
const NO_MAILS: Mails = { owner: undefined };
interface Settled {
  result: MoveResult;
  mails: Mails;
}

export function gameLifecycle(pool: pg.Pool, mail?: MailConfig) {
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
      `update games set status = $2, reject_reason = coalesce($3, reject_reason), updated_at = now(),
         admin_mail_at = case when $4 then now() + interval '${ADMIN_MAIL_DELAY}'
                              when $2 = 'pending' then admin_mail_at end
       where id = $1 returning slug, name, reject_reason as reason`,
      [game.id, after, reason, enteredPending(before, after)],
    );
    const row = rows[0];
    const kind = ownerMailFor(move, before, after);
    return {
      owner: row && kind ? { kind, gameId: game.id, ...row } : undefined,
    };
  };
  const mailIf = async ({ owner }: Mails) => {
    if (mail && owner) {
      await mailOwner(pool, mail, owner);
    }
  };

  return {
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
          if (before === "approved") {
            await saveSnapshot(tx, game.id, true);
          }
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
          if (before === "approved") {
            await saveSnapshot(tx, game.id, true);
          }
          const mails = await settle(
            tx,
            game,
            move,
            before,
            after,
            move === "submit" ? null : reason,
          );
          if (after === "approved") {
            await saveSnapshot(tx, game.id);
          }
          return { result: "ok", mails };
        },
      );
      await mailIf(mails);
      return result;
    },
  };
}
