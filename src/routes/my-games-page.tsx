import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import { EmptyState, PageHead } from "../components/page.tsx";
import { Alert } from "../components/ui/alert.tsx";
import { Badge } from "../components/ui/badge.tsx";
import { Button, buttonVariants } from "../components/ui/button.tsx";
import { getJson } from "../lib/api.ts";
import { api } from "../manage-client.ts";
import { useSignedIn } from "../lib/use-signed-in.ts";
import { useTitle } from "../lib/use-title.ts";

interface Mine {
  slug: string;
  name: string;
  status: string;
  rejectReason: string;
  entryCount: number;
}

const STATUS_BADGE = {
  draft: "secondary",
  pending: "warn",
  approved: "success",
  rejected: "error",
} as const;

function Row({ game, onError }: { game: Mine; onError: () => void }) {
  const queryClient = useQueryClient();
  const slug = encodeURIComponent(game.slug);
  const remove = async (): Promise<void> => {
    if (
      !confirm(
        `Delete "${game.name}"? Its entries, photos and players' progress are gone for good.`,
      )
    ) {
      return;
    }
    const out = await api("DELETE", `/api/games/${slug}`);
    if (out?.status === 200) {
      queryClient.setQueryData<Mine[]>(["my-games"], (list) =>
        list?.filter((g) => g.slug !== game.slug),
      );
    } else {
      onError();
    }
  };
  return (
    <li className="mine-row flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border bg-card p-4 shadow-sm">
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <strong className="break-words">{game.name}</strong>
          <Badge
            variant={
              STATUS_BADGE[game.status as keyof typeof STATUS_BADGE] ??
              "secondary"
            }
          >
            {game.status}
          </Badge>
        </div>
        <p className="fine-print text-xs text-muted-foreground">
          {game.entryCount} entries
          {game.rejectReason ? `. Rejected: ${game.rejectReason}` : ""}
        </p>
      </div>
      <div className="flex gap-2">
        <Link
          className={buttonVariants({
            variant: "outline",
            size: "sm",
            className: "no-underline",
          })}
          to={`/g/${slug}/edit`}
        >
          Edit
        </Link>
        <Link
          className={buttonVariants({
            variant: "ghost",
            size: "sm",
            className: "no-underline",
          })}
          to={`/g/${slug}`}
        >
          View
        </Link>
        <Button
          variant="ghost"
          size="sm"
          className="text-error"
          aria-label={`Delete ${game.name}`}
          onClick={() => void remove()}
        >
          Delete
        </Button>
      </div>
    </li>
  );
}

export function MyGamesPage() {
  useTitle("My games - Guessdle", true);
  const user = useSignedIn("/my-games");
  const mine = useQuery({
    queryKey: ["my-games"],
    queryFn: () => getJson<Mine[]>("/api/my-games"),
    enabled: user !== null,
  });
  const [deleteFailed, setDeleteFailed] = useState(false);
  return (
    <div className="mx-auto max-w-3xl">
      <PageHead
        title="My games"
        actions={
          <Link
            className={buttonVariants({ className: "no-underline" })}
            to="/create"
          >
            <Plus aria-hidden="true" />
            Create a game
          </Link>
        }
      />
      {(mine.isError || deleteFailed) && (
        <Alert id="mine-error" variant="warn" role="status" className="mb-4">
          Could not load your games. Your connection may be down or the server
          may have a problem. Refresh the page; if it keeps failing, try again
          in a few minutes.
        </Alert>
      )}
      {mine.isPending && (
        <EmptyState id="mine-loading">Loading your games…</EmptyState>
      )}
      {mine.data?.length === 0 && (
        <EmptyState id="mine-empty">
          You have not created a game yet.
        </EmptyState>
      )}
      <ul id="mine" className="mine-list space-y-3">
        {mine.data?.map((game) => (
          <Row
            key={game.slug}
            game={game}
            onError={() => setDeleteFailed(true)}
          />
        ))}
      </ul>
    </div>
  );
}
