// Who may see or change a game: the one place that orders 404, 401 and 403.
// A hidden game (a draft, no active entry, or a banned owner's) is a 404 for everyone
// but its owner and admins, before any 401/403 can reveal it exists.
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
  // The signed-in viewer; null only for an anonymous play
  user: SessionUser | null;
}

// Whether the game has enough active entries to draw a Daily Answer or a Round from
const hasEnoughEntries = (roster: Roster): boolean =>
  roster.entries.length >= MIN_ENTRIES;

// Why nobody can play the game for now, whoever may see it: too few active entries, or Paused
// (an active entry missing a value). Play, opening a Party, starting a Round and submitting for
// approval all ask this one rule. Null when it plays.
export const playBlocker = (
  roster: Roster,
): "not_enough_entries" | "game_paused" | null =>
  !hasEnoughEntries(roster)
    ? "not_enough_entries"
    : roster.incomplete > 0
      ? "game_paused"
      : null;

// Open to everyone: playable, and its owner is not banned
export const isPublic = (game: GameRow, roster: Roster): boolean =>
  game.status !== "draft" && hasEnoughEntries(roster) && !game.ownerBanned;

const owns = (game: GameRow, user: SessionUser | null): boolean =>
  user !== null && game.ownerId === user.id;

// Sees a hidden game: its owner (banned or not) and admins
const canSee = (game: GameRow, user: SessionUser | null): boolean =>
  user?.admin === true || owns(game, user);

// A banned owner still sees their game but cannot change it
export const canManage = (game: GameRow, user: SessionUser | null): boolean =>
  user?.admin === true || (owns(game, user) && user?.banned !== true);

// An admin may approve a pending game right from its Play page (issue #88)
export const canApprove = (game: GameRow, user: SessionUser | null): boolean =>
  user?.admin === true && game.status === "pending";

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
    isPublic(found.game, found.roster) &&
    !req.headers.cookie
      ? null
      : await requestUser(pool, req, now());
  return decide(found, user, need) ?? ({ ...found!, user } as Resolved<N>);
}
