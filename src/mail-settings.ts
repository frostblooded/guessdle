// The owner's approval email switches (Settings page): `all` off stops every kind.
export interface MailSettings {
  all: boolean;
  approved: boolean;
  rejected: boolean;
  review: boolean;
}

export type OwnerMailKind = "approved" | "rejected" | "review";

export const MAIL_KINDS: readonly OwnerMailKind[] = [
  "approved",
  "rejected",
  "review",
];

export const wantsMail = (s: MailSettings, kind: OwnerMailKind): boolean =>
  s.all && s[kind];
