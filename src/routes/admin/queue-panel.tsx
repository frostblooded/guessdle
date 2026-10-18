// Admin Approval queue tab: pending games oldest first, each with a play link, Approve, Reject and Delete.
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router";
import { ReviewButtons } from "../../components/review-buttons.tsx";
import { Alert } from "../../components/ui/alert.tsx";
import { Button } from "../../components/ui/button.tsx";
import {
  Table,
  TableCell,
  TableHead,
  TableRow,
} from "../../components/ui/table.tsx";
import { getJson } from "../../lib/api.ts";
import { useDelayed } from "../../lib/use-delayed.ts";
import { api } from "../../manage-client.ts";

interface QueueItem {
  slug: string;
  name: string;
  owner: string | null;
  entryCount: number;
  since: string;
}

const LOAD_FAILED =
  "Could not load the queue. Your connection or the server may be failing, or your admin session may have ended. Reload the page and try again.";
const ACT_FAILED =
  "The review action did not go through. Another admin may have handled this game already, or the server may be failing. Reload the queue to see its current state.";

export function QueuePanel({ active }: { active: boolean }) {
  // Refetched each time the tab opens (stale at once)
  const queue = useQuery({
    queryKey: ["admin", "queue"],
    queryFn: () => getJson<{ games: QueueItem[] }>("/api/admin/queue"),
    enabled: active,
  });
  const [failed, setFailed] = useState(false);
  const games = queue.data?.games ?? [];
  const slow = useDelayed(queue.isPending);
  const message = queue.isError
    ? LOAD_FAILED
    : failed
      ? ACT_FAILED
      : queue.isPending
        ? slow
          ? "Loading the queue…"
          : null
        : games.length === 0
          ? "No games are waiting."
          : null;

  // Runs one review call, then reloads the list
  const act = async (
    method: "POST" | "DELETE",
    path: string,
    payload?: unknown,
  ): Promise<void> => {
    const out = await api(method, `/api/admin/games/${path}`, payload ?? {});
    setFailed(out?.status !== 200);
    if (out?.status === 200) {
      await queue.refetch();
    }
  };

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Games waiting for approval</h2>
      <Alert
        id="queue-message"
        variant="warn"
        role="status"
        hidden={message === null}
      >
        {message}
      </Alert>
      <Table>
        <thead>
          <tr>
            <TableHead>Game</TableHead>
            <TableHead>Owner</TableHead>
            <TableHead>Entries</TableHead>
            <TableHead>Waiting since</TableHead>
            <TableHead>
              <span className="sr-only">Actions</span>
            </TableHead>
          </tr>
        </thead>
        <tbody id="queue-games">
          {games.map((game) => {
            const slug = encodeURIComponent(game.slug);
            return (
              <TableRow key={game.slug} data-slug={game.slug}>
                <TableCell>
                  <Link className="queue-play font-medium" to={`/g/${slug}`}>
                    {game.name}
                  </Link>
                </TableCell>
                <TableCell className="break-all">{game.owner ?? ""}</TableCell>
                <TableCell>{game.entryCount}</TableCell>
                <TableCell className="whitespace-nowrap">
                  {new Date(game.since).toLocaleString()}
                </TableCell>
                <TableCell>
                  <span className="flex justify-end gap-2">
                    <ReviewButtons
                      slug={game.slug}
                      name={game.name}
                      onDone={async () => {
                        setFailed(false);
                        await queue.refetch();
                      }}
                      onFail={() => setFailed(true)}
                    />
                    <Button
                      className="queue-delete"
                      variant="destructive"
                      size="sm"
                      onClick={() => {
                        if (
                          confirm(`Delete "${game.name}" and everything in it?`)
                        ) {
                          void act("DELETE", slug);
                        }
                      }}
                    >
                      Delete
                    </Button>
                  </span>
                </TableCell>
              </TableRow>
            );
          })}
        </tbody>
      </Table>
    </div>
  );
}
