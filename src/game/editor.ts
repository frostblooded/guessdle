import { MIN_ENTRIES } from "./limits.ts";

// Editor wording that depends on a game's status (pure, so it is unit tested).

export interface Details {
  slug: string;
  name: string;
  description: string;
  cover: string;
  status: "draft" | "pending" | "approved" | "rejected";
  rejectReason: string;
  skipPeriod: number | null;
  entryCount: number;
  // Active entries missing a value; while any are, the game is paused
  incompleteCount: number;
  // An admin looking at a pending game
  canApprove?: boolean;
}

// Shared by the editor and the Play page, which knows only these fields
export function statusNotice(
  d: Pick<Details, "status" | "rejectReason" | "entryCount"> &
    Partial<Pick<Details, "incompleteCount">>,
): string {
  const missing = Math.max(0, MIN_ENTRIES - d.entryCount);
  const incomplete = d.incompleteCount ?? 0;
  const paused =
    incomplete > 0
      ? ` Paused: ${incomplete} ${incomplete === 1 ? "entry is" : "entries are"} missing values, so nobody can play until they are filled in.`
      : "";
  const needs =
    (missing > 0
      ? ` It needs ${missing} more ${missing === 1 ? "entry" : "entries"} before anyone can play it.`
      : "") + paused;
  switch (d.status) {
    case "draft":
      return `Draft: only you and admins can see this game.${needs}`;
    case "pending":
      return `Pending: waiting for an admin to review it.${needs}`;
    case "approved":
      return paused.trim();
    case "rejected":
      return `Rejected${d.rejectReason ? `: ${d.rejectReason}` : ""}. Edit the game to send it back to pending.${needs}`;
  }
}

// The names of the saved attributes that saving `drafts` erases from every entry: the removed
// ones (no draft has their id) and the ones whose type changed
export function erasedBy(
  saved: readonly { id: number; name: string; type: string }[],
  drafts: readonly { id?: number | undefined; type: string }[],
): string[] {
  return saved.flatMap((a) => {
    const draft = drafts.find((d) => d.id === a.id);
    return !draft || draft.type !== a.type ? [a.name] : [];
  });
}
