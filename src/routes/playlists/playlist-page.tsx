// One playlist at /p/<id>: its games as gallery cards. Private ones open only for their owner.
import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router";
import { GameCardItem, GameGrid } from "../../components/game-card.tsx";
import { EmptyState, PageHead } from "../../components/page.tsx";
import { SaveButton } from "../../components/save-to-playlist.tsx";
import { Alert } from "../../components/ui/alert.tsx";
import { Badge } from "../../components/ui/badge.tsx";
import { buttonVariants } from "../../components/ui/button.tsx";
import { playlistPath, profilePath } from "../../game/playlists.ts";
import { getJson } from "../../lib/api.ts";
import { playlistKey, type Playlist } from "../../lib/playlists.ts";
import { useTitle } from "../../lib/use-title.ts";
import { NotFoundPage } from "../not-found-page.tsx";

// The playlist named by the route's `:id`, shared by its page and its editor
export function usePlaylist() {
  const raw = useParams()["id"] ?? "";
  const id = /^\d{1,15}$/.test(raw) ? Number(raw) : 0;
  return {
    id,
    query: useQuery({
      queryKey: playlistKey(id),
      queryFn: () => getJson<Playlist>(`/api/playlists/${id}`),
      enabled: id > 0,
    }),
  };
}

// 404s draw the not-found page; anything else says the load failed
export function PlaylistFailure({ error }: { error: Error }) {
  return error.message.endsWith("404") ? (
    <NotFoundPage />
  ) : (
    <Alert id="playlist-error" variant="warn" role="status">
      Could not load this playlist. Your connection may be down or the server
      may have a problem. Refresh the page to try again.
    </Alert>
  );
}

export function PlaylistPage() {
  const { id, query } = usePlaylist();
  const playlist = query.data;
  useTitle(`${playlist?.name ?? "Playlist"} - Guessdle`, !playlist?.public);
  if (id === 0) {
    return <NotFoundPage />;
  }
  if (query.isError) {
    return <PlaylistFailure error={query.error} />;
  }
  if (!playlist) {
    return <EmptyState id="playlist-loading">Loading the playlist…</EmptyState>;
  }
  return (
    <>
      <PageHead
        title={playlist.name}
        titleId="playlist-name"
        lede={
          <div className="space-y-2">
            <p className="flex flex-wrap items-center gap-2">
              <span>
                A playlist by{" "}
                <Link
                  id="playlist-owner"
                  className="font-medium text-primary underline"
                  to={profilePath(playlist.owner)}
                >
                  {playlist.owner}
                </Link>
              </span>
              {!playlist.public && <Badge variant="outline">Private</Badge>}
            </p>
            {playlist.description && (
              <p id="playlist-description" className="whitespace-pre-line">
                {playlist.description}
              </p>
            )}
          </div>
        }
        actions={
          playlist.own && (
            <Link
              id="playlist-edit-link"
              className={buttonVariants({
                variant: "outline",
                className: "no-underline",
              })}
              to={`${playlistPath(playlist.id)}/edit`}
            >
              Edit playlist
            </Link>
          )
        }
      />
      {playlist.games.length === 0 ? (
        <EmptyState id="playlist-empty">
          {playlist.own
            ? "No games here yet. Tap the bookmark on any game in the gallery to add it."
            : "No games here yet."}
        </EmptyState>
      ) : (
        <GameGrid id="playlist-games">
          {playlist.games.map((card) => (
            <GameCardItem
              key={card.slug}
              card={card}
              corner={<SaveButton slug={card.slug} name={card.name} compact />}
            />
          ))}
        </GameGrid>
      )}
    </>
  );
}
