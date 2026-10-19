// Party mode over HTTP (ADR 0016): open a party, read it, join it. Everything during play
// goes over the party socket (party-hub.ts).
import express from "express";
import type { Express, Request, Response } from "express";
import { playBlocker } from "../access.ts";
import { cleanNickname, normalizeCode } from "../../game/party.ts";
import { requestUser } from "../auth.ts";
import { createParty, findParty, joinParty, viewsOf } from "../parties.ts";
import type { PartyHub } from "../party-hub.ts";
import { bodyOf, fail, loadGame, paramOf, type AppContext } from "./context.ts";

export function partyRoutes(
  app: Express,
  ctx: AppContext,
  hub: PartyHub,
): void {
  const { pool, now, random } = ctx;
  const json = express.json({ limit: "1kb" });

  // The party `:code` names, or a 404 sent and null
  const partyOf = async (req: Request, res: Response) => {
    res.set("Cache-Control", "no-store");
    const code = normalizeCode(String(paramOf(req, "code")));
    const party = code === null ? null : await findParty(pool, code, now());
    if (!party) {
      fail(res, "party_not_found");
    }
    return party;
  };

  // A signed-in player of the game hosts; drafts too, for their owner (who alone can load them)
  app.post("/api/games/:slug/parties", json, async (req, res) => {
    res.set("Cache-Control", "no-store");
    const user = await requestUser(pool, req, now());
    if (!user) {
      fail(res, "unauthorized");
      return;
    }
    const loaded = await loadGame(ctx, req, res);
    if (!loaded) {
      return;
    }
    const blocker = playBlocker(loaded.roster);
    if (blocker) {
      fail(res, blocker);
      return;
    }
    const nickname = cleanNickname(bodyOf(req)["nickname"]);
    // How every player picks a guess; typing unless the host chose selection
    const guessMode = bodyOf(req)["guessMode"] ?? "type";
    if (nickname === null || (guessMode !== "type" && guessMode !== "select")) {
      fail(res, "invalid");
      return;
    }
    const out = await createParty(
      pool,
      loaded.game,
      user.id,
      nickname,
      guessMode,
      now(),
      random,
    );
    if (typeof out === "string") {
      fail(res, out);
      return;
    }
    res.status(201).json(out);
  });

  // What a visitor sees: the join screen while open, the results once ended
  app.get("/api/parties/:code", async (req, res) => {
    const party = await partyOf(req, res);
    if (party) {
      res.json((await viewsOf(pool, party, [null])).get(null));
    }
  });

  app.post("/api/parties/:code/join", json, async (req, res) => {
    const party = await partyOf(req, res);
    if (!party) {
      return;
    }
    const nickname = cleanNickname(bodyOf(req)["nickname"]);
    if (nickname === null) {
      fail(res, "invalid");
      return;
    }
    const out = await joinParty(pool, party, nickname, now());
    if (typeof out === "string") {
      fail(res, out);
      return;
    }
    res.status(201).json(out);
    await hub.broadcast(party);
  });
}
