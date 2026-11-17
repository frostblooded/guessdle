import { useQueryClient } from "@tanstack/react-query";
import { SaveButton } from "../../components/save-to-playlist.tsx";
import { useState } from "react";
import { Link } from "react-router";
import { ReviewButtons } from "../../components/review-buttons.tsx";
import { Alert } from "../../components/ui/alert.tsx";
import { buttonVariants } from "../../components/ui/button.tsx";
import { statusNotice, type Details } from "../../game/editor.ts";
import { MIN_ENTRIES } from "../../game/limits.ts";
import { gameKey, ME_KEY } from "../../lib/api.ts";

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
                await client.invalidateQueries({ queryKey: ME_KEY });
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
