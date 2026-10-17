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
}

export function statusNotice(d: Details): string {
  const missing = Math.max(0, MIN_ENTRIES - d.entryCount);
  const needs =
    missing > 0
      ? ` It needs ${missing} more ${missing === 1 ? "entry" : "entries"} before anyone can play it.`
      : "";
  switch (d.status) {
    case "draft":
      return `Draft: only you and admins can see this game.${needs}`;
    case "pending":
      return `Pending: waiting for an admin to review it.${needs}`;
    case "approved":
      return "";
    case "rejected":
      return `Rejected${d.rejectReason ? `: ${d.rejectReason}` : ""}. Edit the game to send it back to pending.${needs}`;
  }
}
