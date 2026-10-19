// Approval emails to a game's owner and the switches that stop them (Settings page).
import type pg from "pg";
import {
  MAIL_KINDS,
  wantsMail,
  type MailSettings,
  type OwnerMailKind,
} from "../mail-settings.ts";
import type { MailConfig } from "./mailer.ts";

type Q = Pick<pg.Pool, "query">;

const COLUMNS = `mail_approval as "all", mail_approved as approved,
  mail_rejected as rejected, mail_review as review,
  mail_friend_requests as friends`;

export async function mailSettings(
  q: Q,
  userId: number,
): Promise<MailSettings | undefined> {
  const { rows } = await q.query<MailSettings>(
    `select ${COLUMNS} from users where id = $1`,
    [userId],
  );
  return rows[0];
}

// A full set of booleans, or undefined when `value` is not one
export function parseMailSettings(value: unknown): MailSettings | undefined {
  if (typeof value !== "object" || value === null) {
    return undefined;
  }
  const v = value as Record<string, unknown>;
  const keys = ["all", ...MAIL_KINDS, "friends"] as const;
  if (!keys.every((k) => typeof v[k] === "boolean")) {
    return undefined;
  }
  return {
    all: v["all"] as boolean,
    approved: v["approved"] as boolean,
    rejected: v["rejected"] as boolean,
    review: v["review"] as boolean,
    friends: v["friends"] as boolean,
  };
}

export async function saveMailSettings(
  q: Q,
  userId: number,
  s: MailSettings,
): Promise<MailSettings> {
  const { rows } = await q.query<MailSettings>(
    `update users set mail_approval = $2, mail_approved = $3, mail_rejected = $4, mail_review = $5,
       mail_friend_requests = $6
     where id = $1 returning ${COLUMNS}`,
    [userId, s.all, s.approved, s.rejected, s.review, s.friends],
  );
  return rows[0]!;
}

export interface OwnerNotice {
  kind: OwnerMailKind;
  gameId: number;
  slug: string;
  name: string;
  reason: string;
}

export function ownerMessage(
  publicUrl: string,
  { kind, slug, name, reason }: OwnerNotice,
): { subject: string; text: string } {
  const game = `${publicUrl}/g/${slug}`;
  const footer = `\n--\nYou get this because you own "${name}" on Guessdle. Turn these emails off: ${publicUrl}/settings\n`;
  switch (kind) {
    case "approved":
      return {
        subject: `Guessdle: "${name}" is approved`,
        text: `Your game "${name}" is approved and listed in the gallery.\n\nPlay it: ${game}\n${footer}`,
      };
    case "rejected":
      return {
        subject: `Guessdle: "${name}" was not approved`,
        text: `Your game "${name}" was not approved.\n\nReason: ${reason || "none given"}\n\nFix it and submit it again: ${game}/edit\n${footer}`,
      };
    case "review":
      return {
        subject: `Guessdle: "${name}" is waiting for approval again`,
        text: `An edit sent your game "${name}" back for review, so it is out of the gallery until an admin approves it again.\n\nSee it: ${game}/edit\n${footer}`,
      };
  }
}

// Mails the game's owner unless their switches say no. Never throws: a mail problem must not fail the change.
export async function mailOwner(
  q: Q,
  mail: MailConfig,
  notice: OwnerNotice,
): Promise<void> {
  try {
    const { rows } = await q.query<MailSettings & { email: string }>(
      `select u.email, ${COLUMNS.replace(/mail_/g, "u.mail_")}
       from games g join users u on u.id = g.owner_id where g.id = $1`,
      [notice.gameId],
    );
    const owner = rows[0];
    if (owner && wantsMail(owner, notice.kind)) {
      await mail.mailer.send({
        to: owner.email,
        ...ownerMessage(mail.publicUrl, notice),
      });
    }
  } catch (err) {
    console.error("Could not mail the owner", err);
  }
}
