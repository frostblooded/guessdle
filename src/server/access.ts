// Who may see or change a game: the one place that orders 404, 401 and 403.
// A hidden game (a draft, or fewer than 2 active entries) is a 404 for everyone but its owner
// and admins, before any 401/403 can reveal it exists.
import type { Request } from "express";
import type pg from "pg";
import { requestUser, type SessionUser } from "./auth.ts";
import {
  findGame,
  loadRoster,
  MIN_ENTRIES,
  type GameRow,
  type Roster,
} from "./games.ts";

export type Need = "play" | "edit" | "admin";
export type Denial = "not_found" | "unauthorized" | "forbidden";

export interface LoadedGame {
  game: GameRow;
  roster: Roster;
  // The signed-in viewer; null only for an anonymous play
  user: SessionUser | null;
}

export const isPlayable = (game: GameRow, roster: Roster): boolean =>
  game.status !== "draft" && roster.entries.length >= MIN_ENTRIES;

export const canManage = (game: GameRow, user: SessionUser | null): boolean =>
  user !== null && (user.admin || game.ownerId === user.id);

const adminDenial = (user: SessionUser | null): Denial | null =>
  user?.admin ? null : user ? "forbidden" : "unauthorized";

// Pure rule. `found` is undefined for an unknown slug.
export function decide(
  found: { game: GameRow; roster: Roster } | undefined,
  user: SessionUser | null,
  need: Need,
): Denial | null {
  if (need === "admin" && adminDenial(user)) {
    return adminDenial(user);
  }
  if (!found) {
    return "not_found";
  }
  const { game, roster } = found;
  if (need === "admin") {
    return null;
  }
  if (!isPlayable(game, roster) && !canManage(game, user)) {
    return "not_found";
  }
  if (need === "play") {
    return null;
  }
  if (!user) {
    return "unauthorized";
  }
  return canManage(game, user) ? null : "forbidden";
}

// The signed-in admin, or the denial (for admin routes that name no game)
export async function resolveAdmin(
  pool: pg.Pool,
  now: () => Date,
  req: Request,
): Promise<SessionUser | Denial> {
  const user = await requestUser(pool, req, now());
  return adminDenial(user) ?? user!;
}

export type Resolved<N extends Need> = N extends "play"
  ? LoadedGame
  : LoadedGame & { user: SessionUser };

export async function resolveGame<N extends Need>(
  pool: pg.Pool,
  now: () => Date,
  req: Request,
  slug: string,
  need: N,
): Promise<Resolved<N> | Denial> {
  const game = await findGame(pool, slug);
  const roster = game && (await loadRoster(pool, game));
  const found = game && roster ? { game, roster } : undefined;
  // Anonymous players of a playable game skip the session query
  const user =
    need === "play" &&
    found &&
    isPlayable(found.game, found.roster) &&
    !req.headers.cookie
      ? null
      : await requestUser(pool, req, now());
  return decide(found, user, need) ?? ({ ...found!, user } as Resolved<N>);
}
