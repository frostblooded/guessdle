// How to play's practice game: the frozen pet game copy migration 011 took (no secret to keep,
// so the page grades in the browser).
import type { Express } from "express";
import type { Tutorial } from "../../game/tutorial.ts";
import type { AppContext } from "./context.ts";

export function tutorialRoutes(app: Express, { pool }: AppContext): void {
  app.get("/api/tutorial", async (_req, res) => {
    res.set("Cache-Control", "public, max-age=3600");
    const { rows } = await pool.query<Tutorial>(
      `select attributes, entries, answer_id as "answerId" from tutorial`,
    );
    if (!rows[0]) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    res.json(rows[0]);
  });
}
