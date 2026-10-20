// Maintenance mode: while an admin has it on, only the maintenance page, sign-in and the admin
// panel's off switch work. Every other page redirects to /, every other API call answers 503.
// nginx can force it on with the API down (MAINTENANCE_FORCED, docs/deploy.md).
import express from "express";
import type { Express } from "express";
import type pg from "pg";
import { resolveAdmin } from "../access.ts";
import { bodyOf, fail, type AppContext } from "./context.ts";

// Pages the shell still loads: the maintenance page (/), sign-in, and the admin panel
const OPEN_PAGES = /^\/(|login|verify|admin|favicon\.ico|dist\/.+)$/;
const OPEN_API =
  /^\/api\/(maintenance|admin\/maintenance|me|auth\/.+|test\/.+)$/;

// Off when the database cannot say, so routes still answer with their own errors (or health)
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
