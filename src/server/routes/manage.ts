// Creating a game and editing its details (spec #66): owner and admin only.
import express from "express";
import type { Express, Request, Response } from "express";
import { slugBase, slugError } from "../../game/slug.ts";
import { mailAdminsPending, submitGame, unpublishGame } from "../approval.ts";
import { releaseEntry, todayIn } from "../answers.ts";
import { requestUser, type SessionUser } from "../auth.ts";
import type { AttributeType } from "../../game/game.ts";
import {
  deleteEntry,
  listEntries,
  parseEntryInput,
  saveEntry,
} from "../entries.ts";
import {
  createGame,
  editAttributes,
  findGame,
  listAttributes,
  listOwned,
  MAX_ATTRIBUTE_NAME,
  updateGame,
  type AttributeEdit,
  type GameRow,
  type GamePatch,
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
  // An entry carries up to 10 attributes of 20 items
  const bigJson = express.json({ limit: "64kb" });
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

  // After an edit: mails the admins when the game just entered pending
  const afterEdit = async (before: GameRow): Promise<void> => {
    const game = await findGame(pool, before.slug);
    if (game?.status === "pending" && before.status !== "pending") {
      await mailAdminsPending(pool, ctx.mail, game);
    }
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

  const attrBase = "/api/games/:slug/attributes";
  const typeOf = (v: unknown): AttributeType | undefined =>
    v === "text" || v === "list" ? v : undefined;
  const nameOf = (v: unknown): string | undefined =>
    typeof v === "string" &&
    v.trim() !== "" &&
    v.trim().length <= MAX_ATTRIBUTE_NAME
      ? v.trim()
      : undefined;
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
      const out = await editAttributes(pool, game, edit);
      if (out !== "ok") {
        invalid(res, FAILURES[out][1], FAILURES[out][0]);
        return;
      }
      await afterEdit(game);
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
  const entryRoute = manageRoute(async ({ game }, _user, req, res) => {
    const raw = req.params["id"];
    const id = raw === undefined ? undefined : idOf(req);
    const current =
      id === undefined
        ? undefined
        : (await listEntries(pool, game)).find((e) => e.id === id);
    const input = await parseEntryInput(
      pool,
      bodyOf(req),
      current?.photo ?? "",
    );
    if (!input || (id === undefined && !input.name)) {
      invalid(res);
      return;
    }
    const out = await saveEntry(pool, game, id, input);
    if (typeof out === "string") {
      invalid(res, ENTRY_FAILURES[out][1], ENTRY_FAILURES[out][0]);
      return;
    }
    await removeUpload(pool, uploadsDir, out.replacedPhoto);
    await afterEdit(game);
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
      if (!(await deleteEntry(pool, game, id))) {
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
      await afterEdit(game);
      res.json(await listEntries(pool, game));
    }),
  );

  // Submit and unpublish: one guarded status move, then the admin email
  const flowRoute = (
    move: (
      q: typeof pool,
      game: GameRow,
    ) => Promise<"ok" | "invalid_state" | "too_few_entries">,
  ) =>
    manageRoute(async ({ game }, _user, req, res) => {
      const out = await move(pool, game);
      if (out !== "ok") {
        invalid(res, out, 409);
        return;
      }
      await afterEdit(game);
      const fresh = await loadGame(ctx, req, res);
      if (fresh) {
        res.json(detailsOf(fresh));
      }
    });
  app.post("/api/games/:slug/submit", writes, json, flowRoute(submitGame));
  app.post(
    "/api/games/:slug/unpublish",
    writes,
    json,
    flowRoute(unpublishGame),
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
      await afterEdit(game);
      const fresh = await loadGame(ctx, req, res);
      if (fresh) {
        res.json(detailsOf(fresh));
      }
    }),
  );
}
