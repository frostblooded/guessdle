// Usernames, profiles and playlists: the one seam between the playlist routes and their tables.
import type pg from "pg";
import { MAX_PLAYLIST_GAMES, MAX_PLAYLISTS } from "../game/limits.ts";
import { IN_GALLERY, listGallery, type GalleryCard } from "./gallery.ts";

// Who is looking: a banned player's public playlists show only to them and admins
export type Viewer = { id: number; admin: boolean } | null;

export async function usernameOf(
  pool: pg.Pool,
  userId: number,
): Promise<string | null> {
  const { rows } = await pool.query<{ username: string | null }>(
    "select username from users where id = $1",
    [userId],
  );
  return rows[0]?.username ?? null;
}

export type UsernameResult = "ok" | "username_taken" | "username_set";

// A username is picked once: profile and playlist links carry it
export async function setUsername(
  pool: pg.Pool,
  userId: number,
  username: string,
): Promise<UsernameResult> {
  try {
    const { rowCount } = await pool.query(
      "update users set username = $2 where id = $1 and username is null",
      [userId, username],
    );
    return rowCount === 0 ? "username_set" : "ok";
  } catch (err) {
    if ((err as { code?: string }).code === "23505") {
      return "username_taken";
    }
    throw err;
  }
}

export interface PlaylistSummary {
  id: number;
  name: string;
  description: string;
  public: boolean;
  // Games the playlist shows now (gallery games only)
  gameCount: number;
}

// SQL count of the gallery games in the playlist aliased `p`, the rule listGallery applies
const SHOWN_COUNT = `(select count(*)::int from playlist_games pl join games g on g.id = pl.game_id
  where pl.playlist_id = p.id and ${IN_GALLERY})`;

export interface Profile {
  username: string;
  playlists: PlaylistSummary[];
  games: GalleryCard[];
}

// A player's profile: their public playlists (every one when `viewer` is them, none to others
// but admins while they are banned), newest first, and their gallery games. null for an
// unknown username.
export async function loadProfile(
  pool: pg.Pool,
  username: string,
  viewer: Viewer,
): Promise<(Profile & { ownerId: number }) | null> {
  const user = await pool.query<{ id: number; banned: boolean }>(
    "select id::int, banned_at is not null as banned from users where username = $1",
    [username],
  );
  const owner = user.rows[0];
  if (owner === undefined) {
    return null;
  }
  const ownerId = owner.id;
  const { rows } = await pool.query<PlaylistSummary>(
    `select p.id::int, p.name, p.description, p.public, ${SHOWN_COUNT} as "gameCount"
     from playlists p where p.owner_id = $1 and (p.owner_id = $2 or (p.public and $3))
     order by p.created_at desc, p.id desc`,
    [ownerId, viewer?.id ?? null, !owner.banned || viewer?.admin === true],
  );
  return {
    ownerId,
    username,
    playlists: rows,
    games: await listGallery(pool, { ownerId }),
  };
}

interface PlaylistRow {
  id: number;
  ownerId: number;
  owner: string;
  name: string;
  description: string;
  public: boolean;
}

// A playlist as `viewer` may see it: private ones only to their owner, a banned owner's only to
// them and admins, else null
export async function findPlaylist(
  pool: pg.Pool,
  id: number,
  viewer: Viewer,
): Promise<PlaylistRow | null> {
  const { rows } = await pool.query<PlaylistRow & { banned: boolean }>(
    `select p.id::int, p.owner_id::int as "ownerId", u.username as owner, p.name,
       p.description, p.public, u.banned_at is not null as banned
     from playlists p join users u on u.id = p.owner_id where p.id = $1`,
    [id],
  );
  const row = rows[0];
  if (!row) {
    return null;
  }
  const { banned, ...playlist } = row;
  return row.ownerId === viewer?.id ||
    (row.public && (!banned || viewer?.admin === true))
    ? playlist
    : null;
}

export const playlistGames = (
  pool: pg.Pool,
  playlistId: number,
): Promise<GalleryCard[]> => listGallery(pool, { playlistId });

// The signed-in player's playlists for the Save menu, each saying whether it holds `slug`
export async function listMine(
  pool: pg.Pool,
  userId: number,
  slug: string,
): Promise<(PlaylistSummary & { saved: boolean })[]> {
  const { rows } = await pool.query<PlaylistSummary & { saved: boolean }>(
    `select p.id::int, p.name, p.description, p.public, ${SHOWN_COUNT} as "gameCount",
       exists (select 1 from playlist_games s join games g on g.id = s.game_id
               where s.playlist_id = p.id and g.slug = $2) as saved
     from playlists p where p.owner_id = $1 order by p.created_at desc, p.id desc`,
    [userId, slug],
  );
  return rows;
}

// The id of a game the gallery shows, the only kind a playlist takes
export async function galleryGameId(
  pool: pg.Pool,
  slug: string,
): Promise<number | null> {
  const { rows } = await pool.query<{ id: number }>(
    `select g.id::int from games g where g.slug = $1 and ${IN_GALLERY}`,
    [slug],
  );
  return rows[0]?.id ?? null;
}

export interface PlaylistInput {
  name: string;
  description: string;
  public: boolean;
}

// The new playlist's id, or null when the player already has MAX_PLAYLISTS
export async function createPlaylist(
  pool: pg.Pool,
  ownerId: number,
  input: PlaylistInput,
): Promise<number | null> {
  // One insert guarded by the count; two racing creates can pass it together, a harmless overshoot
  const { rows } = await pool.query<{ id: number }>(
    `insert into playlists (owner_id, name, description, public)
     select $1, $2, $3, $4
     where (select count(*) from playlists where owner_id = $1) < $5
     returning id::int`,
    [ownerId, input.name, input.description, input.public, MAX_PLAYLISTS],
  );
  return rows[0]?.id ?? null;
}

// Changes the fields given; `slugs` replaces the games, in that order (unknown or hidden
// slugs are dropped)
export async function updatePlaylist(
  pool: pg.Pool,
  id: number,
  patch: Partial<PlaylistInput> & { slugs?: string[] },
): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query(
      `update playlists set name = coalesce($2, name),
         description = coalesce($3, description), public = coalesce($4, public),
         updated_at = now()
       where id = $1`,
      [id, patch.name ?? null, patch.description ?? null, patch.public ?? null],
    );
    if (patch.slugs !== undefined) {
      await client.query("delete from playlist_games where playlist_id = $1", [
        id,
      ]);
      await client.query(
        `insert into playlist_games (playlist_id, game_id, position)
         select $1, g.id, t.position from unnest($2::text[]) with ordinality as t(slug, position)
         join games g on g.slug = t.slug
         where ${IN_GALLERY}
         on conflict do nothing`,
        [id, patch.slugs],
      );
    }
    await client.query("commit");
  } catch (err) {
    await client.query("rollback");
    throw err;
  } finally {
    client.release();
  }
}

export const deletePlaylist = async (
  pool: pg.Pool,
  id: number,
): Promise<void> => {
  await pool.query("delete from playlists where id = $1", [id]);
};

// Adds a game at the end; false when the playlist is full. Adding a saved game changes nothing.
export async function addGame(
  pool: pg.Pool,
  playlistId: number,
  gameId: number,
): Promise<boolean> {
  const { rowCount } = await pool.query(
    `insert into playlist_games (playlist_id, game_id, position)
     select $1, $2, coalesce(max(position), 0) + 1 from playlist_games where playlist_id = $1
     having count(*) < $3
     on conflict do nothing`,
    [playlistId, gameId, MAX_PLAYLIST_GAMES],
  );
  if (rowCount !== 0) {
    return true;
  }
  const saved = await pool.query(
    "select 1 from playlist_games where playlist_id = $1 and game_id = $2",
    [playlistId, gameId],
  );
  return saved.rowCount !== 0;
}

export const removeGame = async (
  pool: pg.Pool,
  playlistId: number,
  gameId: number,
): Promise<void> => {
  await pool.query(
    "delete from playlist_games where playlist_id = $1 and game_id = $2",
    [playlistId, gameId],
  );
};
