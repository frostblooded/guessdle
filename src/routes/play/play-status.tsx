// Play's extras for the game's people: the status line for the owner and admins (issue #87), the
// admin's Approve and Reject buttons on a pending game (issue #88), and the head's Host a party /
// Edit links.
import { useQueryClient } from "@tanstack/react-query";
import { SaveButton } from "../../components/save-to-playlist.tsx";
import { useState } from "react";
import { Link } from "react-router";
import { ReviewButtons } from "../../components/review-buttons.tsx";
import { Alert } from "../../components/ui/alert.tsx";
import { buttonVariants } from "../../components/ui/button.tsx";
import { statusNotice, type Details } from "../../game/editor.ts";
import { MIN_ENTRIES } from "../../game/limits.ts";
import { gameKey } from "../../lib/api.ts";

// What GET /api/games/:slug tells this viewer; the server leaves out `status` for other players
export interface StatusView {
  name?: string;
  status?: Details["status"];
  rejectReason?: string;
  canApprove?: boolean;
}

export function PlayStatus({ slug, view }: { slug: string; view: StatusView }) {
  const client = useQueryClient();
  const [error, setError] = useState("");
  const { status } = view;
  const notice =
    status === undefined
      ? ""
      : statusNotice({
          status,
          rejectReason: view.rejectReason ?? "",
          // The board's own notice already says when entries are missing
          entryCount: MIN_ENTRIES,
        });

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
        {view.canApprove && (
          <span className="play-status flex gap-2">
            <ReviewButtons
              slug={slug}
              name={view.name ?? slug}
              approveId="approve-button"
              rejectId="reject-button"
              onDone={async (review, reason) => {
                setError("");
                // Into the game's cached copy, so the notice and buttons change at once and a
                // later visit does not bring back the pending state
                client.setQueryData<unknown>(gameKey(slug), (game: unknown) =>
                  typeof game === "object" && game !== null
                    ? {
                        ...game,
                        status: review,
                        rejectReason: reason,
                        canApprove: false,
                      }
                    : game,
                );
                // The header's Admin count drops at once, not on the next page load
                await client.invalidateQueries({ queryKey: ["me"] });
              }}
              onFail={setError}
            />
          </span>
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
// `saveName` is the game's name once it is playable: the Save to a playlist button shows then
export function PlayActions({
  slug,
  canHost,
  canEdit,
  saveName,
}: {
  slug: string;
  canHost: boolean;
  canEdit: boolean;
  saveName?: string | undefined;
}) {
  const outline = buttonVariants({ variant: "outline", size: "sm" });
  return (
    <>
      {saveName !== undefined && <SaveButton slug={slug} name={saveName} />}
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
