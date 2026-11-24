import { useQueryClient } from "@tanstack/react-query";
import { SaveButton } from "../../components/save-to-playlist.tsx";
import { Pencil } from "lucide-react";
import { useState, type ReactNode } from "react";
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

export function GameHead({
  title,
  lede,
  actions,
}: {
  title: ReactNode;
  lede?: ReactNode;
  actions: ReactNode;
}) {
  return (
    <div className="page-head mb-5 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-x-6">
      <div className="min-w-0 space-y-1 text-center sm:text-left">
        <h1
          id="game-title"
          className="text-4xl font-bold tracking-wide wrap-anywhere uppercase"
        >
          {title}
        </h1>
        {lede && <div className="lede text-muted-foreground">{lede}</div>}
      </div>
      <div
        id="game-actions"
        className="flex items-start justify-between gap-4 sm:ml-auto sm:justify-end"
      >
        {actions}
      </div>
    </div>
  );
}

export function PlayActions({
  slug,
  canHost,
  canEdit,
  saveName,
  pastDays,
}: {
  slug: string;
  canHost: boolean;
  canEdit: boolean;
  saveName?: string | undefined;
  pastDays?: ReactNode;
}) {
  const outline = buttonVariants({ variant: "outline", size: "sm" });
  return (
    <>
      <div className="flex flex-wrap gap-2">
        {pastDays}
        {canHost && (
          <Link
            id="party-host-link"
            className={outline}
            to={`/party?host=${encodeURIComponent(slug)}`}
          >
            Host a party
          </Link>
        )}
      </div>
      <div className="flex shrink-0 gap-2">
        {canEdit && (
          <Link
            id="edit-link"
            className={buttonVariants({ variant: "outline", size: "icon-sm" })}
            aria-label="Edit game"
            title="Edit game"
            to={`/g/${encodeURIComponent(slug)}/edit`}
          >
            <Pencil aria-hidden="true" />
          </Link>
        )}
        {saveName !== undefined && (
          <SaveButton slug={slug} name={saveName} iconOnly />
        )}
      </div>
    </>
  );
}
