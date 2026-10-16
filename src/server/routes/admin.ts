// Admin-only backup status and user management (spec #38).
import express from "express";
import type { Express, Request, Response } from "express";
import { readBackupStatus } from "../backup.ts";
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
