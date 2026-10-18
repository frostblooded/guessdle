// Admin "All games" tab: every game of any status, searchable, with Delete.
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { Alert } from "../../components/ui/alert.tsx";
import { Badge } from "../../components/ui/badge.tsx";
import { Button } from "../../components/ui/button.tsx";
import { Input, Label } from "../../components/ui/input.tsx";
import {
  Table,
  TableCell,
  TableHead,
  TableRow,
} from "../../components/ui/table.tsx";
import { getJson } from "../../lib/api.ts";
import { useDelayed } from "../../lib/use-delayed.ts";
import { api } from "../../manage-client.ts";

interface GameItem {
  slug: string;
  name: string;
  owner: string | null;
  status: string;
  entryCount: number;
}

const LOAD_FAILED =
  "Could not load the games. Your connection or the server may be failing, or your admin session may have ended. Reload the page and try again.";
const DELETE_FAILED =
  "Could not delete that game. It may already be gone, or the server may be failing. Reload the list to check, then try again.";

export function GamesPanel({ active }: { active: boolean }) {
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
  const [failed, setFailed] = useState(false);
  const games = list.data?.games ?? [];
  const slow = useDelayed(list.isPending);
  const message = list.isError
    ? LOAD_FAILED
    : failed
      ? DELETE_FAILED
      : list.isPending
        ? slow
          ? "Loading games…"
          : null
        : games.length === 0
          ? "No games match."
          : null;
  useEffect(() => () => clearTimeout(timer.current), []);

  const remove = async (game: GameItem): Promise<void> => {
    if (!confirm(`Delete "${game.name}" and everything in it?`)) {
      return;
    }
    const out = await api(
      "DELETE",
      `/api/admin/games/${encodeURIComponent(game.slug)}`,
    );
    setFailed(out?.status !== 200);
    if (out?.status === 200) {
      await list.refetch();
    }
  };

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">All games</h2>
      <div className="max-w-md space-y-2">
        <Label htmlFor="games-search">Search by name, address or owner</Label>
        <Input
          id="games-search"
          type="search"
          maxLength={100}
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            const value = event.target.value;
            clearTimeout(timer.current);
            timer.current = setTimeout(() => setQuery(value), 250);
          }}
        />
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
              <TableCell className="text-right">
                <Button
                  className="games-delete"
                  variant="destructive"
                  size="sm"
                  onClick={() => void remove(game)}
                >
                  Delete
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </tbody>
      </Table>
    </div>
  );
}
