// A playlist's editor at /p/<id>/edit: name, description, public or private, which games and
// in what order. Nothing is stored until Save; Delete asks first.
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Plus, X } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router";
import { fetchGallery, type GameCard } from "../../components/game-card.tsx";
import { MessageCard, PageHead } from "../../components/page.tsx";
import { Alert } from "../../components/ui/alert.tsx";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
} from "../../components/ui/alert-dialog.tsx";
import { Button, buttonVariants } from "../../components/ui/button.tsx";
import { Card } from "../../components/ui/card.tsx";
import { Input, Label, Textarea } from "../../components/ui/input.tsx";
import {
  MAX_DESCRIPTION,
  MAX_NAME,
  MAX_PLAYLIST_GAMES,
} from "../../game/limits.ts";
import { playlistPath, profilePath } from "../../game/playlists.ts";
import { forgetPlaylists, type Playlist } from "../../lib/playlists.ts";
import { useSignedIn } from "../../lib/use-signed-in.ts";
import { useTitle } from "../../lib/use-title.ts";
import { api, errorText } from "../../manage-client.ts";
import { NotFoundPage } from "../not-found-page.tsx";
import { PlaylistFailure, usePlaylist } from "./playlist-page.tsx";

// Swaps the game at `i` with its neighbour `i + by`
const moved = (games: GameCard[], i: number, by: -1 | 1): GameCard[] => {
  const next = [...games];
  [next[i], next[i + by]] = [next[i + by]!, next[i]!];
  return next;
};

// Gallery games not in the playlist whose name matches the search, a few at a time
function AddGames({
  games,
  onAdd,
}: {
  games: GameCard[];
  onAdd: (card: GameCard) => void;
}) {
  const gallery = useQuery({ queryKey: ["games"], queryFn: fetchGallery });
  const [search, setSearch] = useState("");
  const inList = new Set(games.map((g) => g.slug));
  const needle = search.trim().toLowerCase();
  const found = (gallery.data ?? [])
    .filter((g) => !inList.has(g.slug))
    .filter((g) => g.name.toLowerCase().includes(needle))
    .slice(0, 8);
  const full = games.length >= MAX_PLAYLIST_GAMES;
  return (
    <div className="grid gap-2">
      <Label htmlFor="playlist-search">Add games</Label>
      <Input
        id="playlist-search"
        type="search"
        placeholder="Search the gallery"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
      />
      <ul id="playlist-found" className="grid gap-1" aria-label="Games to add">
        {found.map((card) => (
          <li
            key={card.slug}
            className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-secondary"
          >
            <span className="min-w-0 flex-1 truncate">{card.name}</span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={full}
              aria-label={`Add ${card.name}`}
              onClick={() => onAdd(card)}
            >
              <Plus aria-hidden="true" />
              Add
            </Button>
          </li>
        ))}
      </ul>
      {gallery.data && found.length === 0 && (
        <p className="text-sm text-muted-foreground">
          {needle === ""
            ? "Every gallery game is already in this playlist."
            : "No other game matches."}
        </p>
      )}
    </div>
  );
}

function Editor({ playlist }: { playlist: Playlist }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [name, setName] = useState(playlist.name);
  const [description, setDescription] = useState(playlist.description);
  const [shared, setShared] = useState(playlist.public);
  const [games, setGames] = useState(playlist.games);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const back = playlistPath(playlist.id);

  const save = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    setBusy(true);
    const reply = await api("PATCH", `/api/playlists/${playlist.id}`, {
      name,
      description,
      public: shared,
      games: games.map((g) => g.slug),
    });
    if (reply?.status === 200) {
      await forgetPlaylists(queryClient);
      void navigate(back);
      return;
    }
    setBusy(false);
    setError(errorText(reply));
  };

  const remove = async (): Promise<void> => {
    const reply = await api("DELETE", `/api/playlists/${playlist.id}`);
    if (reply?.status === 200) {
      await forgetPlaylists(queryClient);
      void navigate(profilePath(playlist.owner), { replace: true });
      return;
    }
    setError(errorText(reply));
  };

  return (
    <form
      id="playlist-form"
      className="grid gap-6"
      onSubmit={(event) => void save(event)}
    >
      <Card className="grid gap-4 p-5">
        <div className="grid gap-1.5">
          <Label htmlFor="playlist-name-input">Name</Label>
          <Input
            id="playlist-name-input"
            required
            maxLength={MAX_NAME}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="playlist-description-input">Description</Label>
          <Textarea
            id="playlist-description-input"
            maxLength={MAX_DESCRIPTION}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            id="playlist-public"
            type="checkbox"
            className="size-4 accent-primary"
            checked={shared}
            onChange={(event) => setShared(event.target.checked)}
          />
          Public: anyone can see it on your profile
        </label>
      </Card>
      <Card className="grid gap-4 p-5">
        <h2 className="text-lg font-bold tracking-wide uppercase">
          Games ({games.length})
        </h2>
        {games.length === 0 ? (
          <p className="text-sm text-muted-foreground">No games yet.</p>
        ) : (
          <ol id="playlist-order" className="grid gap-1">
            {games.map((card, i) => (
              <li
                key={card.slug}
                className="flex items-center gap-1 rounded-md border bg-card px-2 py-1"
              >
                <span className="w-6 text-right text-xs text-muted-foreground">
                  {i + 1}
                </span>
                <span className="min-w-0 flex-1 truncate px-1">
                  {card.name}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-9"
                  disabled={i === 0}
                  aria-label={`Move ${card.name} up`}
                  onClick={() => setGames(moved(games, i, -1))}
                >
                  <ArrowUp aria-hidden="true" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-9"
                  disabled={i === games.length - 1}
                  aria-label={`Move ${card.name} down`}
                  onClick={() => setGames(moved(games, i, 1))}
                >
                  <ArrowDown aria-hidden="true" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-9 text-error"
                  aria-label={`Remove ${card.name}`}
                  onClick={() =>
                    setGames(games.filter((g) => g.slug !== card.slug))
                  }
                >
                  <X aria-hidden="true" />
                </Button>
              </li>
            ))}
          </ol>
        )}
        <AddGames games={games} onAdd={(card) => setGames([...games, card])} />
      </Card>
      {error && (
        <Alert id="playlist-save-error" variant="error" role="alert">
          {error}
        </Alert>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button id="playlist-save" type="submit" disabled={busy}>
          Save
        </Button>
        <Link
          className={buttonVariants({
            variant: "ghost",
            className: "no-underline",
          })}
          to={back}
        >
          Cancel
        </Link>
        <Button
          id="playlist-delete"
          type="button"
          variant="ghost"
          className="ml-auto text-error"
          onClick={() => setConfirming(true)}
        >
          Delete playlist
        </Button>
      </div>
      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent id="playlist-delete-dialog">
          <AlertDialogTitle>Delete this playlist?</AlertDialogTitle>
          <AlertDialogDescription>
            The games stay in the gallery; only this list of them goes.
          </AlertDialogDescription>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void remove()}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </form>
  );
}

export function PlaylistEditPage() {
  const { id, query } = usePlaylist();
  useTitle("Edit playlist - Guessdle", true);
  const user = useSignedIn(`${playlistPath(id)}/edit`);
  if (id === 0) {
    return <NotFoundPage />;
  }
  if (query.isError) {
    return <PlaylistFailure error={query.error} />;
  }
  if (!user || !query.data) {
    return null;
  }
  if (!query.data.own) {
    return (
      <MessageCard id="playlist-not-yours">
        <h1 className="text-2xl font-bold">Not your playlist</h1>
        <p className="text-muted-foreground">
          Only the player who made a playlist can change it.
        </p>
        <Link
          className={buttonVariants({ className: "no-underline" })}
          to={playlistPath(id)}
        >
          Back to the playlist
        </Link>
      </MessageCard>
    );
  }
  return (
    <div className="mx-auto max-w-2xl">
      <PageHead title="Edit playlist" />
      <Editor playlist={query.data} />
    </div>
  );
}
