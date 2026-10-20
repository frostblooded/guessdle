// The Settings page's email switches: the owner's approval emails (`all` off stops every
// kind) and friend request emails.
export interface MailSettings {
  all: boolean;
  approved: boolean;
  rejected: boolean;
  review: boolean;
  friends: boolean;
}

export type OwnerMailKind = "approved" | "rejected" | "review";

export const MAIL_KINDS: readonly OwnerMailKind[] = [
  "approved",
  "rejected",
  "review",
];

export const wantsMail = (s: MailSettings, kind: OwnerMailKind): boolean =>
  s.all && s[kind];
