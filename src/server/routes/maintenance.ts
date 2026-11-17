import express from "express";
import type { Express } from "express";
import type pg from "pg";
import { resolveAdmin } from "../access.ts";
import { bodyOf, fail, type AppContext } from "./context.ts";

const OPEN_PAGES = /^\/(|login|verify|admin|favicon\.ico|dist\/.+)$/;
const OPEN_API =
  /^\/api\/(maintenance|admin\/maintenance|me|auth\/.+|test\/.+)$/;

const isOn = (pool: pg.Pool): Promise<boolean> =>
  pool
    .query<{ maintenance: boolean }>("select maintenance from site_settings")
    .then(
      ({ rows }) => rows[0]?.maintenance === true,
      () => false,
    );

export function maintenanceRoutes(
  app: Express,
  { pool, now }: AppContext,
): void {
  app.use(async (req, res, next) => {
    const api = req.path.startsWith("/api/");
    if ((api ? OPEN_API : OPEN_PAGES).test(req.path) || !(await isOn(pool))) {
      next();
    } else if (api) {
      fail(res, "maintenance");
    } else {
      res.redirect(302, "/");
    }
  });

  app.get("/api/maintenance", async (_req, res) => {
    res.set("Cache-Control", "no-store");
    res.json({ on: await isOn(pool) });
  });

  app.put(
    "/api/admin/maintenance",
    express.json({ limit: "1kb" }),
    async (req, res) => {
      res.set("Cache-Control", "no-store");
      const actor = await resolveAdmin(pool, now, req);
      if (typeof actor === "string") {
        fail(res, actor);
        return;
      }
      const on = bodyOf(req)["on"];
      if (typeof on !== "boolean") {
        fail(res, "invalid");
        return;
      }
      await pool.query("update site_settings set maintenance = $1", [on]);
      res.json({ on });
    },
  );
}
