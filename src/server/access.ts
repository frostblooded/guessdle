import type { Request } from "express";
import type pg from "pg";
import { requestUser, type SessionUser } from "./auth.ts";
import { MIN_ENTRIES } from "../game/limits.ts";
import { findGame, loadRoster, type GameRow, type Roster } from "./games.ts";

export type Need = "play" | "edit" | "admin";
export type Denial = "not_found" | "unauthorized" | "forbidden" | "banned";

export interface LoadedGame {
  game: GameRow;
  roster: Roster;
  user: SessionUser | null;
}

const hasEnoughEntries = (roster: Roster): boolean =>
  roster.entries.length >= MIN_ENTRIES;

export const playBlocker = (
  roster: Roster,
): "not_enough_entries" | "game_paused" | null =>
  !hasEnoughEntries(roster)
    ? "not_enough_entries"
    : roster.incomplete > 0
      ? "game_paused"
      : null;

export const isPublic = (game: GameRow, roster: Roster): boolean =>
  game.status !== "draft" && hasEnoughEntries(roster) && !game.ownerBanned;

const owns = (game: GameRow, user: SessionUser | null): boolean =>
  user !== null && game.ownerId === user.id;

const canSee = (game: GameRow, user: SessionUser | null): boolean =>
  user?.admin === true || owns(game, user);

export const canManage = (game: GameRow, user: SessionUser | null): boolean =>
  user?.admin === true || (owns(game, user) && user?.banned !== true);

export const canApprove = (game: GameRow, user: SessionUser | null): boolean =>
  user?.admin === true && game.status === "pending";

const adminDenial = (user: SessionUser | null): Denial | null =>
  user?.admin ? null : user ? "forbidden" : "unauthorized";

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
  if (!isPublic(game, roster) && !canSee(game, user)) {
    return "not_found";
  }
  if (need === "play") {
    return null;
  }
  if (!user) {
    return "unauthorized";
  }
  if (canManage(game, user)) {
    return null;
  }
  return owns(game, user) ? "banned" : "forbidden";
}

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
  const user =
    need === "play" &&
    found &&
    isPublic(found.game, found.roster) &&
    !req.headers.cookie
      ? null
      : await requestUser(pool, req, now());
  return decide(found, user, need) ?? ({ ...found!, user } as Resolved<N>);
}
