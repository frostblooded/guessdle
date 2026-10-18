// Play's extras for the game's people: the status line for the owner and admins (issue #87), the
// admin's Approve button on a pending game (issue #88), and the head's Host a party / Edit links.
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router";
import { Alert } from "../../components/ui/alert.tsx";
import { Button, buttonVariants } from "../../components/ui/button.tsx";
import { statusNotice, type Details } from "../../game/editor.ts";
import { MIN_ENTRIES } from "../../game/limits.ts";
import { api, errorText } from "../../manage-client.ts";

// What GET /api/games/:slug tells this viewer; the server leaves out `status` for other players
export interface StatusView {
  status?: Details["status"];
  rejectReason?: string;
  canApprove?: boolean;
}

export function PlayStatus({ slug, view }: { slug: string; view: StatusView }) {
  const client = useQueryClient();
  // Set once this page approved the game, so the notice and button go at once
  const [approved, setApproved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const status = approved ? "approved" : view.status;
  const notice =
    status === undefined
      ? ""
      : statusNotice({
          status,
          rejectReason: view.rejectReason ?? "",
          // The board's own notice already says when entries are missing
          entryCount: MIN_ENTRIES,
        });

  const approve = async (): Promise<void> => {
    setBusy(true);
    const out = await api(
      "POST",
      `/api/admin/games/${encodeURIComponent(slug)}/approve`,
      {},
    );
    setBusy(false);
    if (out?.status !== 200) {
      setError(errorText(out));
      return;
    }
    setError("");
    setApproved(true);
    // The header's Admin count drops at once, not on the next page load
    await client.invalidateQueries({ queryKey: ["me"] });
  };

  return (
    <>
      <div className="game-status mb-3 flex flex-wrap items-center gap-x-4 gap-y-2 empty:hidden">
        {notice && (
          <Alert
            id="status-notice"
            variant="warn"
            role="status"
            className="play-status flex-[1_1_18rem]"
          >
            {notice}
          </Alert>
        )}
        {view.canApprove && !approved && (
          <Button
            id="approve-button"
            size="sm"
            className="play-status"
            disabled={busy}
            onClick={() => void approve()}
          >
            Approve
          </Button>
        )}
      </div>
      <Alert
        id="approve-error"
        variant="error"
        role="alert"
        className="play-status mb-3"
      >
        {error}
      </Alert>
    </>
  );
}

// The head's buttons: Host a party on any playable game (issue #90), Edit for its people
export function PlayActions({
  slug,
  canHost,
  canEdit,
}: {
  slug: string;
  canHost: boolean;
  canEdit: boolean;
}) {
  const outline = buttonVariants({ variant: "outline", size: "sm" });
  return (
    <>
      {canHost && (
        <Link
          id="party-host-link"
          className={outline}
          to={`/party?host=${encodeURIComponent(slug)}`}
        >
          Host a party
        </Link>
      )}
      {canEdit && (
        <Link
          id="edit-link"
          className={outline}
          to={`/g/${encodeURIComponent(slug)}/edit`}
        >
          Edit game
        </Link>
      )}
    </>
  );
}
