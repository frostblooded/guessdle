// The Save button on gallery cards and Play: a dialog listing the player's playlists with a
// checkbox each, and a way to start a new one with this game in it.
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bookmark, Plus } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Link } from "react-router";
import { MAX_NAME } from "../game/limits.ts";
import { profilePath } from "../game/playlists.ts";
import { getJson, useMe } from "../lib/api.ts";
import {
  forgetPlaylists,
  saveMenuKey,
  type SaveMenu,
} from "../lib/playlists.ts";
import { cn } from "../lib/utils.ts";
import { api, errorText, signInThen } from "../manage-client.ts";
import { Alert } from "./ui/alert.tsx";
import { Button } from "./ui/button.tsx";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "./ui/dialog.tsx";
import { Input, Label } from "./ui/input.tsx";
import { UsernameForm } from "./username-form.tsx";

function NewPlaylist({
  slug,
  onError,
}: {
  slug: string;
  onError: (text: string) => void;
}) {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    setBusy(true);
    const reply = await api("POST", "/api/playlists", { name, game: slug });
    setBusy(false);
    if (reply?.status === 201) {
      setName("");
      onError("");
      await forgetPlaylists(queryClient);
      return;
    }
    onError(errorText(reply));
  };
  return (
    <form
      id="new-playlist-form"
      className="grid gap-1.5"
      onSubmit={(event) => void submit(event)}
    >
      <Label htmlFor="new-playlist-name">New playlist</Label>
      <div className="flex gap-2">
        <Input
          id="new-playlist-name"
          required
          maxLength={MAX_NAME}
          placeholder="Playlist name"
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
        <Button id="new-playlist-create" type="submit" disabled={busy}>
          <Plus aria-hidden="true" />
          Create
        </Button>
      </div>
    </form>
  );
}

function SaveMenuBody({ slug }: { slug: string }) {
  const queryClient = useQueryClient();
  const menu = useQuery({
    queryKey: saveMenuKey(slug),
    queryFn: () =>
      getJson<SaveMenu>(`/api/my-playlists?game=${encodeURIComponent(slug)}`),
  });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<number | null>(null);

  const toggle = async (id: number, saved: boolean): Promise<void> => {
    setBusy(id);
    // The box shows the new state at once; the refetch below corrects it if the call failed
    queryClient.setQueryData<SaveMenu>(
      saveMenuKey(slug),
      (menu) =>
        menu && {
          ...menu,
          playlists: menu.playlists.map((p) =>
            p.id === id ? { ...p, saved } : p,
          ),
        },
    );
    const reply = await api(
      saved ? "PUT" : "DELETE",
      `/api/playlists/${id}/games/${encodeURIComponent(slug)}`,
    );
    setBusy(null);
    setError(reply?.status === 200 ? "" : errorText(reply));
    await forgetPlaylists(queryClient);
  };

  if (menu.isPending) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }
  if (menu.isError) {
    return (
      <Alert variant="warn" role="status">
        Could not load your playlists. Check your connection and try again.
      </Alert>
    );
  }
  const { username, playlists } = menu.data;
  if (username === null) {
    return (
      <>
        <p className="text-sm">
          First pick a username: your playlists show on your profile under it.
        </p>
        <UsernameForm onPicked={() => undefined} />
      </>
    );
  }
  return (
    <>
      {playlists.length === 0 ? (
        <p id="save-empty" className="text-sm text-muted-foreground">
          You have no playlists yet. Make one below.
        </p>
      ) : (
        <ul
          id="save-playlists"
          className="grid max-h-64 gap-1 overflow-y-auto"
          aria-label="Your playlists"
        >
          {playlists.map((playlist) => (
            <li key={playlist.id}>
              <label className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 hover:bg-secondary">
                <input
                  type="checkbox"
                  className="size-4 accent-primary"
                  checked={playlist.saved}
                  disabled={busy === playlist.id}
                  onChange={(event) =>
                    void toggle(playlist.id, event.target.checked)
                  }
                />
                <span className="min-w-0 flex-1 truncate">{playlist.name}</span>
                <span className="text-xs text-muted-foreground">
                  {playlist.public ? "Public" : "Private"}
                </span>
              </label>
            </li>
          ))}
        </ul>
      )}
      {error && (
        <Alert id="save-error" variant="error" role="alert">
          {error}
        </Alert>
      )}
      <NewPlaylist slug={slug} onError={setError} />
      <Link
        className="text-sm text-primary underline underline-offset-4"
        to={profilePath(username)}
      >
        See your playlists
      </Link>
    </>
  );
}

// `compact` is the round icon button over a gallery card
export function SaveButton({
  slug,
  name,
  compact = false,
}: {
  slug: string;
  name: string;
  compact?: boolean;
}) {
  const { data: user, isPending } = useMe();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        type="button"
        variant="outline"
        size={compact ? "icon" : "sm"}
        className={cn(
          "save-button",
          compact && "size-9 rounded-full bg-card/90 shadow-sm",
        )}
        aria-label={compact ? `Save ${name} to a playlist` : undefined}
        title={compact ? "Save to a playlist" : undefined}
        disabled={isPending}
        onClick={() => {
          if (user) {
            setOpen(true);
          } else {
            signInThen(location.pathname);
          }
        }}
      >
        <Bookmark aria-hidden="true" />
        {!compact && "Save"}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent id="save-dialog">
          <DialogTitle className="pr-8">Save to a playlist</DialogTitle>
          <DialogDescription>
            Tick the playlists {name} belongs in.
          </DialogDescription>
          {open && <SaveMenuBody slug={slug} />}
        </DialogContent>
      </Dialog>
    </>
  );
}
