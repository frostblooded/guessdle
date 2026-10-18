// Creating a game and editing its details (spec #66): owner and admin only.
import { canApprove, type LoadedGame } from "../access.ts";
import express from "express";
import type { Express, Request, Response } from "express";
import { slugBase, slugError } from "../../game/slug.ts";
import { gameLifecycle, type Move } from "../lifecycle.ts";
import { MAX_ATTRIBUTE_NAME, MAX_NAME } from "../../game/limits.ts";
import { nameIn, parseEntryInput, parseGamePatch } from "../validate.ts";
import { redrawFuture, releaseEntry, todayIn } from "../answers.ts";
import { requestUser, type SessionUser } from "../auth.ts";
import type { AttributeType } from "../../game/game.ts";
import { deleteEntry, listEntries, saveEntry } from "../entries.ts";
import {
  createGame,
  editAttributes,
  listAttributes,
  listOwned,
  patchKind,
  saveAttributes,
  skipOf,
  updateGame,
  type AttributeDraft,
  type AttributeEdit,
} from "../games.ts";
import { imageSizeOf } from "../images.ts";
import { rateLimit, type RateLimit } from "../rate-limit.ts";
import { isGameKind } from "../../game/zoom.ts";
import { uploadRefs } from "../upload-refs.ts";
import {
  bodyOf,
  fail,
  guardGame,
  loadGame,
  type AppContext,
} from "./context.ts";

// Starting values, tune after launch (docs/deploy.md)
export const DEFAULT_WRITE_LIMIT: RateLimit = { max: 60, windowMs: 60_000 };

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
  const refs = uploadRefs(pool, uploadsDir);
  const sizeOf = imageSizeOf(uploadsDir);

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

  // Owner or admin only (guardGame "edit"): 404 for a hidden game first, then 401 / 403
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
      const loaded = await guardGame(ctx, req, res, "edit");
      if (loaded) {
        await handler(loaded, loaded.user, req, res);
      }
    };

  // `canApprove`: the editor shows an admin Approve and Reject on a pending game
  const detailsOf = ({ game, roster }: LoadedGame, user: SessionUser) => ({
    slug: game.slug,
    name: game.name,
    description: game.description,
    cover: game.coverUrl,
    status: game.status,
    rejectReason: game.rejectReason,
    skipPeriod: game.skipPeriod,
    kind: game.kind,
    zoomParts: game.zoomParts,
    entryCount: roster.entries.length,
    incompleteCount: roster.incomplete,
    canApprove: canApprove(game, user),
  });

  app.post("/api/games", writes, json, async (req, res) => {
    const user = await needUser(req, res);
    if (!user) {
      return;
    }
    const { name, slug, kind = "classic" } = bodyOf(req);
    const title = nameIn(name, MAX_NAME);
    if (title === undefined || !isGameKind(kind)) {
      fail(res, "invalid");
      return;
    }
    if (slug !== undefined) {
      const error = typeof slug === "string" ? slugError(slug) : "invalid";
      if (error) {
        fail(res, error);
        return;
      }
    }
    const created = await createGame(
      pool,
      user.id,
      title,
      todayIn(now(), ctx.timeZone),
      typeof slug === "string" ? { typed: slug } : { base: slugBase(title) },
      kind,
    );
    if (created === "slug_taken") {
      fail(res, "slug_taken");
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
    manageRoute(async (loaded, user, _req, res) => {
      res.json(detailsOf(loaded, user));
    }),
  );

  const attrBase = "/api/games/:slug/attributes";
  const typeOf = (v: unknown): AttributeType | undefined =>
    v === "text" || v === "list" || v === "number" ? v : undefined;
  const nameOf = (v: unknown): string | undefined =>
    nameIn(v, MAX_ATTRIBUTE_NAME);
  const idOf = (req: Request): number => {
    const raw = String(req.params["id"]);
    return /^\d{1,15}$/.test(raw) ? Number(raw) : -1;
  };
  // The editor's Save: the whole list, each item {id?, name, type}; undefined when malformed
  const draftsOf = (v: unknown): AttributeDraft[] | undefined => {
    if (!Array.isArray(v)) {
      return undefined;
    }
    const drafts = v.map((item: unknown): AttributeDraft | undefined => {
      const { id, name, type } = (item ?? {}) as Record<string, unknown>;
      const [n, t] = [nameOf(name), typeOf(type)];
      const okId = id === undefined || (Number.isInteger(id) && Number(id) > 0);
      return n && t && okId
        ? { id: id as number | undefined, name: n, type: t }
        : undefined;
    });
    return drafts.every((d) => d !== undefined) ? drafts : undefined;
  };
  // Applies the edit `build` reads from the request (one change, or the whole list), then
  // answers with the attributes
  const attributeRoute = (
    build: (req: Request) => AttributeEdit | AttributeDraft[] | undefined,
  ) =>
    manageRoute(async ({ game }, _user, req, res) => {
      const edit = build(req);
      // A Zoom game has no attributes
      if (!edit || game.kind === "zoom") {
        fail(res, "invalid");
        return;
      }
      const out = await lifecycle.edit(
        game,
        "attributes",
        (tx) =>
          Array.isArray(edit)
            ? saveAttributes(tx, game, edit)
            : editAttributes(tx, game, edit),
        (r) => r === "ok",
      );
      if (out !== "ok" && out !== "noop") {
        fail(res, out);
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
  app.put(
    attrBase,
    writes,
    json,
    attributeRoute((req) => draftsOf(bodyOf(req)["attributes"])),
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
        !(await refs.mayAttach(
          input.photo,
          current?.photo ?? "",
          user.id,
          game.ownerId,
        )))
    ) {
      fail(res, "invalid");
      return;
    }
    const out = await lifecycle.edit(
      game,
      "entries",
      (tx) => saveEntry(tx, game, id, input, sizeOf),
      (r) => typeof r !== "string",
    );
    if (typeof out === "string") {
      fail(res, out);
      return;
    }
    await refs.release([out.replacedPhoto]);
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
        fail(res, "not_found");
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
    manageRoute(async ({ game }, user, req, res) => {
      const out = await lifecycle.move(game, move);
      if (out !== "ok") {
        fail(res, out);
        return;
      }
      const fresh = await loadGame(ctx, req, res);
      if (fresh) {
        res.json(detailsOf(fresh, user));
      }
    });
  app.post("/api/games/:slug/submit", writes, json, flowRoute("submit"));
  app.post("/api/games/:slug/unpublish", writes, json, flowRoute("unpublish"));

  app.delete(
    "/api/games/:slug",
    writes,
    manageRoute(async ({ game }, _user, _req, res) => {
      await refs.dropGame(game);
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
        fail(res, "slug_immutable");
        return;
      }
      const patch = parseGamePatch(
        body,
        Math.max(0, roster.entries.length - 1),
        game.kind === "zoom",
      );
      if (
        !patch ||
        (patch.coverUrl !== undefined &&
          !(await refs.mayAttach(
            patch.coverUrl,
            game.coverUrl,
            user.id,
            game.ownerId,
          )))
      ) {
        fail(res, "invalid");
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
      await refs.release([replaced]);
      const fresh = await loadGame(ctx, req, res);
      if (fresh) {
        res.json(detailsOf(fresh, user));
      }
    }),
  );
}
