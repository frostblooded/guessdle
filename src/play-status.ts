// The Play page's status line, shown only to the game's owner and admins (issue #87).
import { statusNotice, type Details } from "./game/editor.ts";
import { MIN_ENTRIES } from "./game/limits.ts";

// What GET /api/games/:slug tells this viewer; the server leaves out `status` for other players
export interface StatusView {
  status?: Details["status"];
  rejectReason?: string;
}

export function showGameStatus(view: StatusView): void {
  const notice = document.querySelector<HTMLElement>("#status-notice")!;
  notice.textContent =
    view.status === undefined
      ? ""
      : statusNotice({
          status: view.status,
          rejectReason: view.rejectReason ?? "",
          // The board's own notice already says when entries are missing
          entryCount: MIN_ENTRIES,
        });
  notice.hidden = notice.textContent === "";
}
