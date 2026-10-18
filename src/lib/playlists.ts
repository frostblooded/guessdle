// Browser side of profiles and playlists: the shapes the API sends, their query keys, and
// dropping the cached copies after a change.
import type { QueryClient } from "@tanstack/react-query";
import type { GameCard } from "../components/game-card.tsx";
import { ME_KEY } from "./api.ts";

export interface PlaylistSummary {
  id: number;
  name: string;
  description: string;
  public: boolean;
  gameCount: number;
}

export interface Profile {
  username: string;
  own: boolean;
  playlists: PlaylistSummary[];
  games: GameCard[];
}

export interface Playlist {
  id: number;
  owner: string;
  name: string;
  description: string;
  public: boolean;
  own: boolean;
  games: GameCard[];
}

export interface SaveMenu {
  username: string | null;
  playlists: (PlaylistSummary & { saved: boolean })[];
}

export const profileKey = (username: string) => ["profile", username] as const;
export const playlistKey = (id: number) => ["playlist", id] as const;
export const saveMenuKey = (slug: string) => ["save-menu", slug] as const;

// After any playlist change every cached profile, playlist and Save menu may be out of date
export async function forgetPlaylists(client: QueryClient): Promise<void> {
  await Promise.all(
    ["profile", "playlist", "save-menu"].map((key) =>
      client.invalidateQueries({ queryKey: [key] }),
    ),
  );
}

// After picking a username: the header menu and the Save menus learn it
export async function forgetUser(client: QueryClient): Promise<void> {
  await Promise.all([
    client.invalidateQueries({ queryKey: ME_KEY }),
    client.invalidateQueries({ queryKey: ["save-menu"] }),
  ]);
}
