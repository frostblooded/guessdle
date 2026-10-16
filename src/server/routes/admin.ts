// Admin-only backup status and user management (spec #38).
import express from "express";
import type { Express, Request, Response } from "express";
import {
  approveGame,
  deleteGame,
  listQueue,
  MAX_REASON,
  rejectGame,
} from "../approval.ts";
import { readBackupStatus } from "../backup.ts";
import { findGame, type GameRow } from "../games.ts";
import { removeUpload } from "../upload-store.ts";
import { requestUser, type SessionUser } from "../auth.ts";
import { listUsers, setAdmin } from "../users.ts";
import { bodyOf, paramOf, type AppContext } from "./context.ts";

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
  const adminRoute =
    (handler: (admin: AdminCtx) => Promise<void>) =>
    async (req: Request, res: Response): Promise<void> => {
      res.set("Cache-Control", "no-store");
      const user = await requestUser(pool, req, now());
      if (!user) {
        res.status(401).json({ error: "unauthorized" });
        return;
      }
      if (!user.admin) {
        res.status(403).json({ error: "forbidden" });
        return;
      }
      await handler({ req, res, actor: user });
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
  // Approve, reject (with a reason) or delete the game at :slug
  const gameRoute = (
    act: (
      game: GameRow,
      req: Request,
    ) => Promise<"ok" | "invalid_state" | "invalid">,
  ) =>
    adminRoute(async ({ req, res }) => {
      const game = await findGame(pool, String(paramOf(req, "slug")));
      if (!game) {
        res.status(404).json({ error: "not_found" });
        return;
      }
      const out = await act(game, req);
      if (out === "ok") {
        res.json({ ok: true });
      } else {
        res.status(out === "invalid" ? 400 : 409).json({ error: out });
      }
    });
  const json = express.json({ limit: "2kb" });
  app.post(
    "/api/admin/games/:slug/approve",
    json,
    gameRoute((game) => approveGame(pool, game)),
  );
  app.post(
    "/api/admin/games/:slug/reject",
    json,
    gameRoute((game, req) => {
      const reason = bodyOf(req)["reason"];
      const text = typeof reason === "string" ? reason.trim() : "";
      return text === "" || text.length > MAX_REASON
        ? Promise.resolve("invalid")
        : rejectGame(pool, game, text);
    }),
  );
  app.delete(
    "/api/admin/games/:slug",
    gameRoute(async (game) => {
      for (const url of await deleteGame(pool, game)) {
        await removeUpload(pool, uploadsDir, url);
      }
      return "ok";
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
        res.status(400).json({ error: "invalid" });
        return;
      }
      const result = await setAdmin(pool, actor.id, Number(id), admin);
      if (result === "ok") {
        res.json({ ok: true });
      } else {
        res
          .status(result === "not_found" ? 404 : 409)
          .json({ error: result === "self" ? "self_demotion" : result });
      }
    }),
  );
}
