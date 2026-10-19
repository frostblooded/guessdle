// Friends: the Friends page's list, requests by exact username or email, accept and remove.
import express from "express";
import type { Express, Request, Response } from "express";
import { requestUser, type SessionUser } from "../auth.ts";
import { MAX_EMAIL_LENGTH } from "../email-login.ts";
import {
  acceptRequest,
  findPlayer,
  listFriends,
  mailRequest,
  removeFriend,
  sendRequest,
} from "../friends.ts";
import { rateLimit, type RateLimit } from "../rate-limit.ts";
import { bodyOf, fail, paramOf, type AppContext } from "./context.ts";
import { DEFAULT_WRITE_LIMIT } from "./manage.ts";

const idParam = (req: Request): number | null => {
  const raw = String(paramOf(req, "id"));
  return /^\d{1,15}$/.test(raw) ? Number(raw) : null;
};

export function friendRoutes(
  app: Express,
  { pool, now, mail }: AppContext,
  limit: RateLimit = DEFAULT_WRITE_LIMIT,
): void {
  const json = express.json({ limit: "1kb" });
  const writes = rateLimit(pool, now, limit);

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

  app.get("/api/friends", async (req, res) => {
    res.set("Cache-Control", "no-store");
    const user = await needUser(req, res);
    if (user) {
      res.json(await listFriends(pool, user.id));
    }
  });

  // `query`: the other player's exact username or email
  app.post("/api/friends", writes, json, async (req, res) => {
    const user = await needUser(req, res);
    if (!user) {
      return;
    }
    if (user.banned) {
      fail(res, "banned");
      return;
    }
    const query = bodyOf(req)["query"];
    if (
      typeof query !== "string" ||
      !query.trim() ||
      query.length > MAX_EMAIL_LENGTH
    ) {
      fail(res, "invalid");
      return;
    }
    const other = await findPlayer(pool, query);
    if (!other || other.banned) {
      fail(res, "player_not_found");
      return;
    }
    if (other.id === user.id) {
      fail(res, "friend_self");
      return;
    }
    const outcome = await sendRequest(pool, user.id, other.id, now());
    if (outcome === "exists") {
      fail(res, "friend_exists");
      return;
    }
    if (outcome === "sent" && mail) {
      await mailRequest(pool, mail, user.id, other.id);
    }
    res.json({ outcome });
  });

  // Accepts the request from player `:id`
  app.put("/api/friends/:id", writes, async (req, res) => {
    const user = await needUser(req, res);
    if (!user) {
      return;
    }
    const id = idParam(req);
    if (id === null || !(await acceptRequest(pool, user.id, id, now()))) {
      fail(res, "friend_request_not_found");
      return;
    }
    res.json({ ok: true });
  });

  // Declines, cancels or unfriends player `:id`
  app.delete("/api/friends/:id", writes, async (req, res) => {
    const user = await needUser(req, res);
    if (!user) {
      return;
    }
    const id = idParam(req);
    if (id !== null) {
      await removeFriend(pool, user.id, id);
    }
    res.json({ ok: true });
  });
}
