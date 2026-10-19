// Admin "All games" tab: every game of any status, searchable, with Delete, and Approve and Reject
// on pending games.
import {
  keepPreviousData,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { Search } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { ReviewButtons } from "../../components/review-buttons.tsx";
import { Alert } from "../../components/ui/alert.tsx";
import { Badge } from "../../components/ui/badge.tsx";
import { Button } from "../../components/ui/button.tsx";
import { Input, Label, NativeSelect } from "../../components/ui/input.tsx";
import {
  Table,
  TableCell,
  TableHead,
  TableRow,
} from "../../components/ui/table.tsx";
import { forgetGame, getJson } from "../../lib/api.ts";
import { useDelayed } from "../../lib/use-delayed.ts";
import { api } from "../../manage-client.ts";

interface GameItem {
  slug: string;
  name: string;
  owner: string | null;
  status: string;
  entryCount: number;
}

const STATUSES = ["pending", "approved", "rejected", "draft"] as const;

const LOAD_FAILED =
  "Could not load the games. Your connection or the server may be failing, or your admin session may have ended. Reload the page and try again.";
const DELETE_FAILED =
  "Could not delete that game. It may already be gone, or the server may be failing. Reload the list to check, then try again.";
const REVIEW_FAILED =
  "The review action did not go through. Another admin may have handled this game already, or the server may be failing. Reload the list to see its current state.";

export function GamesPanel({ active }: { active: boolean }) {
  const client = useQueryClient();
  const [search, setSearch] = useState("");
  // What the list shows: the search box, 250 ms after the last keystroke
  const [query, setQuery] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // Refetched each time the tab opens (stale at once)
  const list = useQuery({
    queryKey: ["admin", "games", query],
    queryFn: () =>
      getJson<{ games: GameItem[] }>(
        `/api/admin/games?q=${encodeURIComponent(query.trim())}`,
      ),
    enabled: active,
    placeholderData: keepPreviousData,
  });
  // The last failed action's message, cleared by the next one that works
  const [failed, setFailed] = useState<string | null>(null);
  // The status filter works on the loaded list; "" shows every status
  const [status, setStatus] = useState("");
  const games = (list.data?.games ?? []).filter(
    (game) => status === "" || game.status === status,
  );
  const slow = useDelayed(list.isPending);
  const message = list.isError
    ? LOAD_FAILED
    : (failed ??
      (list.isPending
        ? slow
          ? "Loading games…"
          : null
        : games.length === 0
          ? "No games match."
          : null));
  useEffect(() => () => clearTimeout(timer.current), []);

  const remove = async (game: GameItem): Promise<void> => {
    if (!confirm(`Delete "${game.name}" and everything in it?`)) {
      return;
    }
    const out = await api(
      "DELETE",
      `/api/admin/games/${encodeURIComponent(game.slug)}`,
    );
    setFailed(out?.status === 200 ? null : DELETE_FAILED);
    if (out?.status === 200) {
      await list.refetch();
    }
  };

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">All games</h2>
      <div
        role="search"
        className="games-toolbar flex flex-wrap items-end gap-3"
      >
        <div className="min-w-0 flex-[1_1_16rem] space-y-2">
          <Label htmlFor="games-search" className="sr-only">
            Search by name, address or owner
          </Label>
          <div className="relative">
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              id="games-search"
              type="search"
              maxLength={100}
              placeholder="Search by name, address or owner"
              className="pl-9"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                const value = event.target.value;
                clearTimeout(timer.current);
                timer.current = setTimeout(() => setQuery(value), 250);
              }}
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="games-status" className="sr-only">
            Status
          </Label>
          <NativeSelect
            id="games-status"
            value={status}
            onChange={(event) => setStatus(event.target.value)}
          >
            <option value="">All statuses</option>
            {STATUSES.map((value) => (
              <option key={value} value={value}>
                {value[0]!.toUpperCase() + value.slice(1)}
              </option>
            ))}
          </NativeSelect>
        </div>
      </div>
      <Alert
        id="games-message"
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
            <TableHead>Status</TableHead>
            <TableHead>Entries</TableHead>
            <TableHead>
              <span className="sr-only">Actions</span>
            </TableHead>
          </tr>
        </thead>
        <tbody id="all-games">
          {games.map((game) => (
            <TableRow key={game.slug} data-slug={game.slug}>
              <TableCell>
                <Link
                  className="font-medium"
                  to={`/g/${encodeURIComponent(game.slug)}`}
                >
                  {game.name}
                </Link>
              </TableCell>
              <TableCell className="break-all">{game.owner ?? ""}</TableCell>
              <TableCell>
                <Badge variant="outline">{game.status}</Badge>
              </TableCell>
              <TableCell>{game.entryCount}</TableCell>
              <TableCell>
                <span className="flex flex-wrap justify-end gap-2">
                  {game.status === "pending" && (
                    <ReviewButtons
                      slug={game.slug}
                      name={game.name}
                      onDone={async () => {
                        setFailed(null);
                        forgetGame(client, game.slug);
                        await list.refetch();
                      }}
                      onFail={() => setFailed(REVIEW_FAILED)}
                    />
                  )}
                  <Button
                    className="games-delete"
                    variant="destructive"
                    size="sm"
                    onClick={() => void remove(game)}
                  >
                    Delete
                  </Button>
                </span>
              </TableCell>
            </TableRow>
          ))}
        </tbody>
      </Table>
    </div>
  );
}
