// Usernames, profiles and playlists: anyone reads public ones, only the owner changes them.
import express from "express";
import type { Express, Request, Response } from "express";
import {
  MAX_DESCRIPTION,
  MAX_NAME,
  MAX_PLAYLIST_GAMES,
} from "../../game/limits.ts";
import { isUsername, normalizeUsername } from "../../game/playlists.ts";
import { requestUser, type SessionUser } from "../auth.ts";
import { listGallery } from "../gallery.ts";
import { findGame } from "../games.ts";
import {
  addGame,
  createPlaylist,
  deletePlaylist,
  findPlaylist,
  galleryGameId,
  listMine,
  loadProfile,
  removeGame,
  setUsername,
  updatePlaylist,
  usernameOf,
  type PlaylistInput,
} from "../playlists.ts";
import { rateLimit, type RateLimit } from "../rate-limit.ts";
import { nameIn } from "../validate.ts";
import { bodyOf, fail, paramOf, queryOf, type AppContext } from "./context.ts";
import { DEFAULT_WRITE_LIMIT } from "./manage.ts";

// The playlist fields of a create or PATCH body; undefined when any is malformed
function parseInput(
  body: Record<string, unknown>,
): (Partial<PlaylistInput> & { slugs?: string[] }) | undefined {
  const out: Partial<PlaylistInput> & { slugs?: string[] } = {};
  if (body["name"] !== undefined) {
    const name = nameIn(body["name"], MAX_NAME);
    if (name === undefined) {
      return undefined;
    }
    out.name = name;
  }
  const { description, games } = body;
  if (description !== undefined) {
    if (
      typeof description !== "string" ||
      description.length > MAX_DESCRIPTION
    ) {
      return undefined;
    }
    out.description = description.trim();
  }
  if (body["public"] !== undefined) {
    if (typeof body["public"] !== "boolean") {
      return undefined;
    }
    out.public = body["public"];
  }
  if (games !== undefined) {
    if (
      !Array.isArray(games) ||
      games.length > MAX_PLAYLIST_GAMES ||
      !games.every((slug) => typeof slug === "string")
    ) {
      return undefined;
    }
    out.slugs = games as string[];
  }
  return out;
}

const idParam = (req: Request): number | null => {
  const raw = String(paramOf(req, "id"));
  return /^\d{1,15}$/.test(raw) ? Number(raw) : null;
};

export function playlistRoutes(
  app: Express,
  ctx: AppContext,
  limit: RateLimit = DEFAULT_WRITE_LIMIT,
): void {
  const { pool, now } = ctx;
  const json = express.json({ limit: "16kb" });
  const writes = rateLimit(pool, now, limit);

  const needUser = async (
    req: Request,
    res: Response,
  ): Promise<SessionUser | undefined> => {
    const user = await requestUser(pool, req, now());
    if (!user) {
      fail(res, "unauthorized");
    }
    return user ?? undefined;
  };

  // The viewer's own playlist from `:id`; a playlist they cannot see is a 404, one of someone
  // else's they can see is a 403
  const ownPlaylist = async (
    req: Request,
    res: Response,
  ): Promise<number | undefined> => {
    const user = await needUser(req, res);
    if (!user) {
      return undefined;
    }
    const id = idParam(req);
    const playlist = id === null ? null : await findPlaylist(pool, id, user);
    if (!playlist) {
      fail(res, "playlist_not_found");
      return undefined;
    }
    if (playlist.ownerId !== user.id) {
      fail(res, "forbidden");
      return undefined;
    }
    if (user.banned) {
      fail(res, "banned");
      return undefined;
    }
    return playlist.id;
  };

  app.put("/api/me/username", writes, json, async (req, res) => {
    const user = await needUser(req, res);
    if (!user) {
      return;
    }
    const raw = bodyOf(req)["username"];
    const username = typeof raw === "string" ? normalizeUsername(raw) : raw;
    if (!isUsername(username)) {
      fail(res, "invalid_username");
      return;
    }
    const out = await setUsername(pool, user.id, username);
    if (out !== "ok") {
      fail(res, out);
      return;
    }
    res.json({ username });
  });

  app.get("/api/users/:username", async (req, res) => {
    res.set("Cache-Control", "no-store");
    const username = String(paramOf(req, "username"));
    const viewer = await requestUser(pool, req, now());
    const profile = isUsername(username)
      ? await loadProfile(pool, username, viewer)
      : null;
    if (!profile) {
      fail(res, "not_found");
      return;
    }
    const { ownerId, ...shown } = profile;
    res.json({ ...shown, own: viewer?.id === ownerId });
  });

  // The Save menu: the viewer's playlists, each saying whether it holds `?game=<slug>`
  app.get("/api/my-playlists", async (req, res) => {
    res.set("Cache-Control", "no-store");
    const user = await needUser(req, res);
    if (!user) {
      return;
    }
    const game = queryOf(req)["game"];
    res.json({
      username: await usernameOf(pool, user.id),
      playlists: await listMine(
        pool,
        user.id,
        typeof game === "string" ? game : "",
      ),
    });
  });

  // `game` (a slug) goes straight into the new playlist, for "New playlist" in the Save menu
  app.post("/api/playlists", writes, json, async (req, res) => {
    const user = await needUser(req, res);
    if (!user) {
      return;
    }
    if (user.banned) {
      fail(res, "banned");
      return;
    }
    const body = bodyOf(req);
    const input = parseInput(body);
    const game = body["game"];
    if (
      !input?.name ||
      input.slugs !== undefined ||
      (game !== undefined && typeof game !== "string")
    ) {
      fail(res, "invalid");
      return;
    }
    if ((await usernameOf(pool, user.id)) === null) {
      fail(res, "username_required");
      return;
    }
    const gameId = game === undefined ? null : await galleryGameId(pool, game);
    if (game !== undefined && gameId === null) {
      fail(res, "game_not_listed");
      return;
    }
    const id = await createPlaylist(pool, user.id, {
      name: input.name,
      description: input.description ?? "",
      public: input.public ?? false,
    });
    if (id === null) {
      fail(res, "too_many_playlists");
      return;
    }
    if (gameId !== null) {
      await addGame(pool, id, gameId);
    }
    res.status(201).json({ id });
  });

  app.get("/api/playlists/:id", async (req, res) => {
    res.set("Cache-Control", "no-store");
    const id = idParam(req);
    const viewer = await requestUser(pool, req, now());
    const playlist = id === null ? null : await findPlaylist(pool, id, viewer);
    if (!playlist) {
      fail(res, "playlist_not_found");
      return;
    }
    const { ownerId, ...shown } = playlist;
    res.json({
      ...shown,
      own: viewer?.id === ownerId,
      games: await listGallery(pool, { playlistId: playlist.id }),
    });
  });

  app.patch("/api/playlists/:id", writes, json, async (req, res) => {
    const id = await ownPlaylist(req, res);
    if (id === undefined) {
      return;
    }
    const input = parseInput(bodyOf(req));
    if (!input) {
      fail(res, "invalid");
      return;
    }
    await updatePlaylist(pool, id, input);
    res.json({ ok: true });
  });

  app.delete("/api/playlists/:id", writes, async (req, res) => {
    const id = await ownPlaylist(req, res);
    if (id === undefined) {
      return;
    }
    await deletePlaylist(pool, id);
    res.json({ ok: true });
  });

  app.put("/api/playlists/:id/games/:slug", writes, async (req, res) => {
    const id = await ownPlaylist(req, res);
    if (id === undefined) {
      return;
    }
    const gameId = await galleryGameId(pool, String(paramOf(req, "slug")));
    if (gameId === null) {
      fail(res, "game_not_listed");
      return;
    }
    if (!(await addGame(pool, id, gameId))) {
      fail(res, "playlist_full");
      return;
    }
    res.json({ ok: true });
  });

  // Removing works on a hidden game too, so a player can tidy a list they cannot see in full
  app.delete("/api/playlists/:id/games/:slug", writes, async (req, res) => {
    const id = await ownPlaylist(req, res);
    if (id === undefined) {
      return;
    }
    const game = await findGame(pool, String(paramOf(req, "slug")));
    if (game) {
      await removeGame(pool, id, game.id);
    }
    res.json({ ok: true });
  });
}
