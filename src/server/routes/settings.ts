// The signed-in user's Settings page: the approval email switches.
import express from "express";
import type { Express } from "express";
import { requestUser } from "../auth.ts";
import {
  mailSettings,
  parseMailSettings,
  saveMailSettings,
} from "../owner-mail.ts";
import { bodyOf, fail, type AppContext } from "./context.ts";

export function settingsRoutes(app: Express, { pool, now }: AppContext): void {
  app.get("/api/settings/mail", async (req, res) => {
    res.set("Cache-Control", "no-store");
    const user = await requestUser(pool, req, now());
    if (!user) {
      fail(res, "unauthorized");
      return;
    }
    res.json(await mailSettings(pool, user.id));
  });

  app.put(
    "/api/settings/mail",
    express.json({ limit: "1kb" }),
    async (req, res) => {
      const user = await requestUser(pool, req, now());
      if (!user) {
        fail(res, "unauthorized");
        return;
      }
      const settings = parseMailSettings(bodyOf(req));
      if (!settings) {
        fail(res, "invalid");
        return;
      }
      res.json(await saveMailSettings(pool, user.id, settings));
    },
  );
}
