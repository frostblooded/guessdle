// Admin-only backup status and user management (spec #38).
import express from "express";
import type { Express, Request, Response } from "express";
import { listAllGames, listQueue, MAX_REASON } from "../approval.ts";
import { gameLifecycle, type MoveResult } from "../lifecycle.ts";
import { readBackupStatus } from "../backup.ts";
import type { GameRow } from "../games.ts";
import { resolveAdmin } from "../access.ts";
import { uploadRefs } from "../upload-refs.ts";
import type { SessionUser } from "../auth.ts";
import { deleteUser, listUsers, setAdmin } from "../users.ts";
import {
  bodyOf,
  fail,
  guardGame,
  paramOf,
  queryOf,
  type AppContext,
} from "./context.ts";

const MAX_USER_ID = 2147483647;

interface AdminCtx {
  req: Request;
  res: Response;
  actor: SessionUser;
}

export function adminRoutes(
  app: Express,
  ctx: AppContext,
  backupDir: string,
  uploadsDir: string,
): void {
  const { pool, now } = ctx;
  const refs = uploadRefs(pool, uploadsDir);
  const adminRoute =
    (handler: (admin: AdminCtx) => Promise<void>) =>
    async (req: Request, res: Response): Promise<void> => {
      res.set("Cache-Control", "no-store");
      const actor = await resolveAdmin(pool, now, req);
      if (typeof actor === "string") {
        fail(res, actor);
        return;
      }
      await handler({ req, res, actor });
    };

  app.get(
    "/api/admin/backup",
    adminRoute(async ({ res }) => {
      res.json(await readBackupStatus(backupDir, now()));
    }),
  );
  app.get(
    "/api/admin/users",
    adminRoute(async ({ res, actor }) => {
      res.json({ users: await listUsers(pool), self: actor.id });
    }),
  );
  app.get(
    "/api/admin/queue",
    adminRoute(async ({ res }) => {
      res.json({ games: await listQueue(pool) });
    }),
  );
  app.get(
    "/api/admin/games",
    adminRoute(async ({ req, res }) => {
      const q = queryOf(req)["q"];
      const search = typeof q === "string" ? q.slice(0, 100) : "";
      res.json({ games: await listAllGames(pool, search) });
    }),
  );
  // Approve, reject (with a reason) or delete the game at :slug
  const gameRoute = (
    act: (game: GameRow, req: Request) => Promise<MoveResult | "invalid">,
  ) =>
    adminRoute(async ({ req, res }) => {
      const loaded = await guardGame(ctx, req, res, "admin");
      if (!loaded) {
        return;
      }
      const out = await act(loaded.game, req);
      if (out === "ok") {
        res.json({ ok: true });
      } else {
        fail(res, out);
      }
    });
  const lifecycle = gameLifecycle(pool, ctx.mail);
  const json = express.json({ limit: "2kb" });
  app.post(
    "/api/admin/games/:slug/approve",
    json,
    gameRoute((game) => lifecycle.move(game, "approve")),
  );
  app.post(
    "/api/admin/games/:slug/reject",
    json,
    gameRoute((game, req) => {
      const reason = bodyOf(req)["reason"];
      const text = typeof reason === "string" ? reason.trim() : "";
      return text === "" || text.length > MAX_REASON
        ? Promise.resolve("invalid")
        : lifecycle.move(game, "reject", text);
    }),
  );
  app.delete(
    "/api/admin/games/:slug",
    gameRoute(async (game) => {
      await refs.dropGame(game);
      return "ok";
    }),
  );
  app.delete(
    "/api/admin/users/:id",
    adminRoute(async ({ req, res, actor }) => {
      const id = String(paramOf(req, "id"));
      if (!/^[1-9]\d{0,9}$/.test(id) || Number(id) > MAX_USER_ID) {
        fail(res, "invalid");
        return;
      }
      const result = await deleteUser(refs, actor.id, Number(id));
      if (result !== "ok") {
        fail(res, result);
        return;
      }
      res.json({ ok: true });
    }),
  );
  app.put(
    "/api/admin/users/:id",
    express.json({ limit: "1kb" }),
    adminRoute(async ({ req, res, actor }) => {
      const id = String(paramOf(req, "id"));
      const admin = bodyOf(req)["admin"];
      if (
        !/^[1-9]\d{0,9}$/.test(id) ||
        Number(id) > MAX_USER_ID ||
        typeof admin !== "boolean"
      ) {
        fail(res, "invalid");
        return;
      }
      const result = await setAdmin(pool, actor.id, Number(id), admin);
      if (result === "ok") {
        res.json({ ok: true });
      } else {
        fail(res, result);
      }
    }),
  );
}
