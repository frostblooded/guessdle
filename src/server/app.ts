import express from "express";
import type { Express } from "express";
import type pg from "pg";

export interface AppDeps {
  pool: pg.Pool;
}

// The API only; callers add static files (dev server) or sit behind nginx (prod)
export function createApp({ pool }: AppDeps): Express {
  const app = express();
  app.get("/api/health", async (_req, res) => {
    try {
      await pool.query("select 1");
      res.json({ status: "ok" });
    } catch {
      res.status(503).json({ status: "unavailable" });
    }
  });
  app.use("/api", (_req, res) => {
    res.status(404).json({ error: "not_found" });
  });
  return app;
}
