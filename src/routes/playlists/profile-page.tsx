// A player's profile at /u/<username>: their playlists and the games they made. /profile sends
// the signed-in player to their own, after picking a username if they have none yet.
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router";
import { GameCardItem, GameGrid } from "../../components/game-card.tsx";
import { EmptyState, MessageCard, PageHead } from "../../components/page.tsx";
import { SaveButton } from "../../components/save-to-playlist.tsx";
import { Alert } from "../../components/ui/alert.tsx";
import { Badge } from "../../components/ui/badge.tsx";
import { Button } from "../../components/ui/button.tsx";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "../../components/ui/dialog.tsx";
import { Input, Label } from "../../components/ui/input.tsx";
import { UsernameForm } from "../../components/username-form.tsx";
import { MAX_NAME } from "../../game/limits.ts";
import { playlistPath, profilePath } from "../../game/playlists.ts";
import { getJson } from "../../lib/api.ts";
import {
  forgetPlaylists,
  profileKey,
  type PlaylistSummary,
  type Profile,
} from "../../lib/playlists.ts";
import { useSignedIn } from "../../lib/use-signed-in.ts";
import { useTitle } from "../../lib/use-title.ts";
import { api, errorText } from "../../manage-client.ts";
import { NotFoundPage } from "../not-found-page.tsx";

export function OwnProfilePage() {
  useTitle("Your profile - Guessdle", true);
  const user = useSignedIn("/profile");
  const navigate = useNavigate();
  if (user === null) {
    return null;
  }
  if (user.username !== null) {
    return <Navigate replace to={profilePath(user.username)} />;
  }
  return (
    <MessageCard className="items-stretch text-left">
      <h1 className="text-2xl font-bold tracking-wide uppercase">
        Pick a username
      </h1>
      <p className="text-sm text-muted-foreground">
        Your profile shows your playlists and the games you made under it.
      </p>
      <UsernameForm
        onPicked={(username) =>
          void navigate(profilePath(username), { replace: true })
        }
      />
    </MessageCard>
  );
}

const count = (n: number, one: string): string =>
  `${n} ${one}${n === 1 ? "" : "s"}`;

function PlaylistCard({ playlist }: { playlist: PlaylistSummary }) {
  return (
    <li>
      <Link
        to={playlistPath(playlist.id)}
        className="playlist-card flex h-full flex-col gap-1.5 rounded-lg border-2 border-tile bg-card p-4 text-card-foreground no-underline transition-colors hover:bg-secondary"
      >
        <span className="flex flex-wrap items-center gap-2">
          <strong className="text-lg tracking-wide break-words uppercase">
            {playlist.name}
          </strong>
          {!playlist.public && <Badge variant="outline">Private</Badge>}
        </span>
        {playlist.description && (
          <span className="line-clamp-2 text-sm text-muted-foreground">
            {playlist.description}
          </span>
        )}
        <span className="fine-print mt-auto text-xs font-medium text-muted-foreground">
          {count(playlist.gameCount, "game")}
        </span>
      </Link>
    </li>
  );
}

// "New playlist" on your own profile: name and visibility, then on to its edit page
function NewPlaylistDialog() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [shared, setShared] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    setBusy(true);
    const reply = await api<{ id: number }>("POST", "/api/playlists", {
      name,
      public: shared,
    });
    setBusy(false);
    if (reply?.status === 201) {
      await forgetPlaylists(queryClient);
      void navigate(`${playlistPath(reply.data.id)}/edit`);
      return;
    }
    setError(errorText(reply));
  };
  return (
    <>
      <Button id="new-playlist-button" onClick={() => setOpen(true)}>
        <Plus aria-hidden="true" />
        New playlist
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent id="new-playlist-dialog">
          <DialogTitle className="pr-8">New playlist</DialogTitle>
          <DialogDescription>
            Add games from the gallery with their Save button, or on the next
            page.
          </DialogDescription>
          <form className="grid gap-3" onSubmit={(event) => void submit(event)}>
            <div className="grid gap-1.5">
              <Label htmlFor="playlist-new-name">Name</Label>
              <Input
                id="playlist-new-name"
                required
                maxLength={MAX_NAME}
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                id="playlist-new-public"
                type="checkbox"
                className="size-4 accent-primary"
                checked={shared}
                onChange={(event) => setShared(event.target.checked)}
              />
              Public: anyone can see it on your profile
            </label>
            {error && (
              <Alert variant="error" role="alert">
                {error}
              </Alert>
            )}
            <Button id="playlist-new-create" type="submit" disabled={busy}>
              Create playlist
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function ProfilePage() {
  const username = useParams()["username"] ?? "";
  useTitle(`${username} - Guessdle`);
  const profile = useQuery({
    queryKey: profileKey(username),
    queryFn: () =>
      getJson<Profile>(`/api/users/${encodeURIComponent(username)}`),
  });
  if (profile.isError) {
    return profile.error.message.endsWith("404") ? (
      <NotFoundPage />
    ) : (
      <Alert id="profile-error" variant="warn" role="status">
        Could not load this profile. Your connection may be down or the server
        may have a problem. Refresh the page to try again.
      </Alert>
    );
  }
  const data = profile.data;
  return (
    <>
      <PageHead
        // Usernames are lowercase; the heading keeps them as typed
        title={<span className="normal-case">{username}</span>}
        titleId="profile-name"
        lede={
          data &&
          `${count(data.playlists.length, "playlist")} · ${count(data.games.length, "game")} made`
        }
        actions={data?.own && <NewPlaylistDialog />}
      />
      {profile.isPending && (
        <EmptyState id="profile-loading">Loading the profile…</EmptyState>
      )}
      {data && (
        <div className="space-y-10">
          <section aria-labelledby="playlists-heading" className="space-y-4">
            <h2
              id="playlists-heading"
              className="text-xl font-bold tracking-wide uppercase"
            >
              Playlists
            </h2>
            {data.playlists.length === 0 ? (
              <EmptyState id="playlists-empty">
                {data.own
                  ? "You have no playlists yet. Tap the bookmark on any game to save it to one."
                  : "No public playlists yet."}
              </EmptyState>
            ) : (
              <ul
                id="profile-playlists"
                className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
              >
                {data.playlists.map((playlist) => (
                  <PlaylistCard key={playlist.id} playlist={playlist} />
                ))}
              </ul>
            )}
          </section>
          {data.games.length > 0 && (
            <section aria-labelledby="games-heading" className="space-y-4">
              <h2
                id="games-heading"
                className="text-xl font-bold tracking-wide uppercase"
              >
                Games by {username}
              </h2>
              <GameGrid id="profile-games">
                {data.games.map((card) => (
                  <GameCardItem
                    key={card.slug}
                    card={card}
                    corner={
                      <SaveButton slug={card.slug} name={card.name} compact />
                    }
                  />
                ))}
              </GameGrid>
            </section>
          )}
        </div>
      )}
    </>
  );
}
