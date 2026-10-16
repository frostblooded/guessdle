// Creating a game and editing its details (spec #66): owner and admin only.
import express from "express";
import type { Express, Request, Response } from "express";
import { slugBase, slugError } from "../../game/slug.ts";
import { deleteGame } from "../approval.ts";
import { gameLifecycle, type Move } from "../lifecycle.ts";
import {
  MAX_NAME,
  nameIn,
  parseEntryInput,
  parseGamePatch,
} from "../validate.ts";
import { redrawFuture, releaseEntry, todayIn } from "../answers.ts";
import { requestUser, type SessionUser } from "../auth.ts";
import type { AttributeType } from "../../game/game.ts";
import { deleteEntry, listEntries, saveEntry } from "../entries.ts";
import {
  createGame,
  editAttributes,
  listAttributes,
  listOwned,
  MAX_ATTRIBUTE_NAME,
  patchKind,
  skipOf,
  updateGame,
  type AttributeEdit,
  type GameRow,
} from "../games.ts";
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
  // An entry carries up to 10 attributes of 20 items
  const bigJson = express.json({ limit: "64kb" });
  const writes = rateLimit(pool, now, limit);
  const lifecycle = gameLifecycle(pool, ctx.mail);
  // A cover or photo is the caller's own upload or the one already set
  const uploadOk = async (
    url: string,
    current: string,
    user: SessionUser,
    game: GameRow,
  ): Promise<boolean> =>
    url === "" ||
    url === current ||
    (await isStoredUpload(pool, url, [user.id, game.ownerId]));

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
    const title = nameIn(name, MAX_NAME);
    if (title === undefined) {
      invalid(res);
      return;
    }
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

  const attrBase = "/api/games/:slug/attributes";
  const typeOf = (v: unknown): AttributeType | undefined =>
    v === "text" || v === "list" ? v : undefined;
  const nameOf = (v: unknown): string | undefined =>
    nameIn(v, MAX_ATTRIBUTE_NAME);
  const idOf = (req: Request): number => {
    const raw = String(req.params["id"]);
    return /^\d{1,15}$/.test(raw) ? Number(raw) : -1;
  };
  const FAILURES = {
    limit: [400, "invalid"],
    exists: [409, "attribute_exists"],
    not_found: [404, "not_found"],
  } as const;
  // Applies the edit `build` reads from the request, then answers with the attributes
  const attributeRoute = (build: (req: Request) => AttributeEdit | undefined) =>
    manageRoute(async ({ game }, _user, req, res) => {
      const edit = build(req);
      if (!edit) {
        invalid(res);
        return;
      }
      const out = await lifecycle.edit(
        game,
        "attributes",
        (tx) => editAttributes(tx, game, edit),
        (r) => r === "ok",
      );
      if (out !== "ok" && out !== "noop") {
        invalid(res, FAILURES[out][1], FAILURES[out][0]);
        return;
      }
      res.json(await listAttributes(pool, game));
    });

  app.get(
    attrBase,
    manageRoute(async ({ game }, _user, _req, res) => {
      res.json(await listAttributes(pool, game));
    }),
  );
  app.post(
    attrBase,
    writes,
    json,
    attributeRoute((req) => {
      const { name, type } = bodyOf(req);
      const [n, t] = [nameOf(name), typeOf(type)];
      return n && t ? { add: { name: n, type: t } } : undefined;
    }),
  );
  app.patch(
    `${attrBase}/:id`,
    writes,
    json,
    attributeRoute((req) => {
      const { name, type } = bodyOf(req);
      const change = { id: idOf(req), name: nameOf(name), type: typeOf(type) };
      return (name === undefined || change.name) &&
        (type === undefined || change.type)
        ? { change }
        : undefined;
    }),
  );
  app.delete(
    `${attrBase}/:id`,
    writes,
    attributeRoute((req) => ({ remove: idOf(req) })),
  );

  const entryBase = "/api/games/:slug/entries";
  const ENTRY_FAILURES = {
    invalid: [400, "invalid"],
    exists: [409, "entry_exists"],
    not_found: [404, "not_found"],
  } as const;
  // Creates (no :id) or changes an entry, then answers with the entry list
  const entryRoute = manageRoute(async ({ game }, user, req, res) => {
    const raw = req.params["id"];
    const id = raw === undefined ? undefined : idOf(req);
    const current =
      id === undefined
        ? undefined
        : (await listEntries(pool, game)).find((e) => e.id === id);
    const input = parseEntryInput(bodyOf(req));
    if (
      !input ||
      (id === undefined && !input.name) ||
      (input.photo !== undefined &&
        !(await uploadOk(input.photo, current?.photo ?? "", user, game)))
    ) {
      invalid(res);
      return;
    }
    const out = await lifecycle.edit(
      game,
      "entries",
      (tx) => saveEntry(tx, game, id, input),
      (r) => typeof r !== "string",
    );
    if (typeof out === "string") {
      invalid(res, ENTRY_FAILURES[out][1], ENTRY_FAILURES[out][0]);
      return;
    }
    await removeUpload(pool, uploadsDir, out.replacedPhoto);
    res.json(await listEntries(pool, game));
  });
  app.get(
    entryBase,
    manageRoute(async ({ game }, _user, _req, res) => {
      res.json(await listEntries(pool, game));
    }),
  );
  app.post(entryBase, writes, bigJson, entryRoute);
  app.patch(`${entryBase}/:id`, writes, bigJson, entryRoute);
  app.delete(
    `${entryBase}/:id`,
    writes,
    manageRoute(async ({ game, roster }, _user, req, res) => {
      const id = idOf(req);
      if (
        !(await lifecycle.edit(
          game,
          "entries",
          (tx) => deleteEntry(tx, game, id),
          Boolean,
        ))
      ) {
        invalid(res, "not_found", 404);
        return;
      }
      await releaseEntry(
        pool,
        game,
        roster.entries.map((e) => e.id).filter((e) => e !== id),
        todayIn(now(), ctx.timeZone),
        id,
        ctx.random,
      );
      res.json(await listEntries(pool, game));
    }),
  );

  // Submit and unpublish: one guarded status move
  const flowRoute = (move: Move) =>
    manageRoute(async ({ game }, _user, req, res) => {
      const out = await lifecycle.move(game, move);
      if (out !== "ok") {
        invalid(res, out, 409);
        return;
      }
      const fresh = await loadGame(ctx, req, res);
      if (fresh) {
        res.json(detailsOf(fresh));
      }
    });
  app.post("/api/games/:slug/submit", writes, json, flowRoute("submit"));
  app.post("/api/games/:slug/unpublish", writes, json, flowRoute("unpublish"));

  app.delete(
    "/api/games/:slug",
    writes,
    manageRoute(async ({ game }, _user, _req, res) => {
      for (const url of await deleteGame(pool, game)) {
        await removeUpload(pool, uploadsDir, url);
      }
      res.json({ ok: true });
    }),
  );

  app.patch(
    "/api/games/:slug",
    writes,
    json,
    manageRoute(async (loaded, user, req, res) => {
      const { game, roster } = loaded;
      const body = bodyOf(req);
      if (body["slug"] !== undefined && body["slug"] !== game.slug) {
        invalid(res, "slug_immutable");
        return;
      }
      const patch = parseGamePatch(
        body,
        Math.max(0, roster.entries.length - 1),
      );
      if (
        !patch ||
        (patch.coverUrl !== undefined &&
          !(await uploadOk(patch.coverUrl, game.coverUrl, user, game)))
      ) {
        invalid(res);
        return;
      }
      const replaced = await lifecycle.edit(
        game,
        patchKind(game, patch),
        (tx) => updateGame(tx, game, patch),
      );
      const edited = { ...game, ...patch };
      if (skipOf(edited) !== skipOf(game) && roster.entries.length > 0) {
        await redrawFuture(
          pool,
          edited,
          roster.entries.map((e) => e.id),
          todayIn(now(), ctx.timeZone),
          ctx.random,
        );
      }
      await removeUpload(pool, uploadsDir, replaced);
      const fresh = await loadGame(ctx, req, res);
      if (fresh) {
        res.json(detailsOf(fresh));
      }
    }),
  );
}
