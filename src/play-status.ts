// The Play page's status line, shown only to the game's owner and admins (issue #87), and the
// admin's Approve button on a pending game (issue #88).
import { statusNotice, type Details } from "./game/editor.ts";
import { MIN_ENTRIES } from "./game/limits.ts";
import { api, errorText } from "./manage-client.ts";

// What GET /api/games/:slug tells this viewer; the server leaves out `status` for other players
export interface StatusView {
  status?: Details["status"];
  rejectReason?: string;
  canApprove?: boolean;
}

const $ = <T extends HTMLElement>(selector: string): T =>
  document.querySelector<T>(selector)!;

function showNotice(view: StatusView): void {
  const notice = $("#status-notice");
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
  if (view.status !== undefined) {
    notice.dataset["status"] = view.status;
  }
}

export function showGameStatus(slug: string, view: StatusView): void {
  showNotice(view);
  const approve = $<HTMLButtonElement>("#approve-button");
  const error = $("#approve-error");
  approve.hidden = view.canApprove !== true;
  approve.onclick = async (): Promise<void> => {
    approve.disabled = true;
    const out = await api(
      "POST",
      `/api/admin/games/${encodeURIComponent(slug)}/approve`,
      {},
    );
    approve.disabled = false;
    error.textContent = out?.status === 200 ? "" : errorText(out);
    error.hidden = out?.status === 200;
    if (out?.status === 200) {
      approve.hidden = true;
      showNotice({ status: "approved" });
    }
  };
}
