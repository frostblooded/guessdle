// Creating a game and editing its details (spec #66): owner and admin only.
import express from "express";
import type { Express, Request, Response } from "express";
import { slugBase, slugError } from "../../game/slug.ts";
import { todayIn } from "../answers.ts";
import { requestUser, type SessionUser } from "../auth.ts";
import { createGame, listOwned, updateGame, type GamePatch } from "../games.ts";
import { rateLimit, type RateLimit } from "../rate-limit.ts";
import { isStoredUpload, removeUpload } from "../upload-store.ts";
import {
  bodyOf,
  canManage,
  loadGame,
  type AppContext,
  type LoadedGame,
} from "./context.ts";

// Starting values, tune after launch (docs/deploy.md)
export const DEFAULT_WRITE_LIMIT: RateLimit = { max: 60, windowMs: 60_000 };

const MAX_NAME = 60;
const MAX_DESCRIPTION = 500;

const invalid = (res: Response, error = "invalid", status = 400): void => {
  res.status(status).json({ error });
};

export function manageRoutes(
  app: Express,
  ctx: AppContext,
  uploadsDir: string,
  limit: RateLimit = DEFAULT_WRITE_LIMIT,
): void {
  const { pool, now } = ctx;
  const json = express.json({ limit: "10kb" });
  const writes = rateLimit(pool, now, limit);

  const needUser = async (
    req: Request,
    res: Response,
  ): Promise<SessionUser | undefined> => {
    const user = await requestUser(pool, req, now());
    if (!user) {
      res.status(401).json({ error: "unauthorized" });
    }
    return user ?? undefined;
  };

  // requireOwnerOrAdmin: a hidden game is a 404 for everyone else (loadGame), then 401 / 403
  const manageRoute =
    (
      handler: (
        game: LoadedGame,
        user: SessionUser,
        req: Request,
        res: Response,
      ) => Promise<void>,
    ) =>
    async (req: Request, res: Response): Promise<void> => {
      res.set("Cache-Control", "no-store");
      const loaded = await loadGame(ctx, req, res);
      if (!loaded) {
        return;
      }
      const user = await needUser(req, res);
      if (!user) {
        return;
      }
      if (!canManage(loaded.game, user)) {
        res.status(403).json({ error: "forbidden" });
        return;
      }
      await handler(loaded, user, req, res);
    };

  const detailsOf = ({ game, roster }: LoadedGame) => ({
    slug: game.slug,
    name: game.name,
    description: game.description,
    cover: game.coverUrl,
    status: game.status,
    rejectReason: game.rejectReason,
    skipPeriod: game.skipPeriod,
    entryCount: roster.entries.length,
  });

  app.post("/api/games", writes, json, async (req, res) => {
    const user = await needUser(req, res);
    if (!user) {
      return;
    }
    const { name, slug } = bodyOf(req);
    if (
      typeof name !== "string" ||
      name.trim() === "" ||
      name.trim().length > MAX_NAME
    ) {
      invalid(res);
      return;
    }
    const title = name.trim();
    if (slug !== undefined) {
      const error = typeof slug === "string" ? slugError(slug) : "invalid";
      if (error) {
        invalid(res, error);
        return;
      }
    }
    const created = await createGame(
      pool,
      user.id,
      title,
      todayIn(now(), ctx.timeZone),
      typeof slug === "string" ? { typed: slug } : { base: slugBase(title) },
    );
    if (created === "slug_taken") {
      invalid(res, "slug_taken", 409);
      return;
    }
    res.status(201).json({ slug: created });
  });

  app.get("/api/my-games", async (req, res) => {
    res.set("Cache-Control", "no-store");
    const user = await needUser(req, res);
    if (user) {
      res.json(await listOwned(pool, user.id));
    }
  });

  app.get(
    "/api/games/:slug/details",
    manageRoute(async (loaded, _user, _req, res) => {
      res.json(detailsOf(loaded));
    }),
  );

  app.patch(
    "/api/games/:slug",
    writes,
    json,
    manageRoute(async (loaded, _user, req, res) => {
      const { game, roster } = loaded;
      const body = bodyOf(req);
      if (body["slug"] !== undefined && body["slug"] !== game.slug) {
        invalid(res, "slug_immutable");
        return;
      }
      const patch: GamePatch = {};
      const { name, description, skipPeriod, coverUrl } = body;
      if (name !== undefined) {
        if (
          typeof name !== "string" ||
          name.trim() === "" ||
          name.trim().length > MAX_NAME
        ) {
          invalid(res);
          return;
        }
        patch.name = name.trim();
      }
      if (description !== undefined) {
        if (
          typeof description !== "string" ||
          description.length > MAX_DESCRIPTION
        ) {
          invalid(res);
          return;
        }
        patch.description = description;
      }
      if (skipPeriod !== undefined) {
        const max = Math.max(0, roster.entries.length - 1);
        if (
          skipPeriod !== null &&
          !(
            Number.isInteger(skipPeriod) &&
            (skipPeriod as number) >= 0 &&
            (skipPeriod as number) <= max
          )
        ) {
          invalid(res);
          return;
        }
        patch.skipPeriod = skipPeriod as number | null;
      }
      if (coverUrl !== undefined) {
        if (
          typeof coverUrl !== "string" ||
          (coverUrl !== "" &&
            coverUrl !== game.coverUrl &&
            !(await isStoredUpload(pool, coverUrl)))
        ) {
          invalid(res);
          return;
        }
        patch.coverUrl = coverUrl;
      }
      const replaced = await updateGame(pool, game, patch);
      await removeUpload(pool, uploadsDir, replaced);
      const fresh = await loadGame(ctx, req, res);
      if (fresh) {
        res.json(detailsOf(fresh));
      }
    }),
  );
}
