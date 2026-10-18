// Zoomed parts of an answer's image (ADR 0019): the only way a Zoom game's image reaches a
// player before the day or round is over. Parts are rendered from the stored upload, so the
// image's own URL stays secret.
import type { Express, Request, Response } from "express";
import type { Entry } from "../../game/game.ts";
import { normalizeCode } from "../../game/party.ts";
import { partRenderer } from "../images.ts";
import { findParty, loadData } from "../parties.ts";
import {
  fail,
  loadGame,
  paramOf,
  todayOf,
  todaysAnswer,
  type AppContext,
} from "./context.ts";

export function zoomRoutes(
  app: Express,
  ctx: AppContext,
  uploadsDir: string,
): void {
  const render = partRenderer(uploadsDir);
  // A 1-based part number from the URL, or 0
  const partOf = (req: Request): number => {
    const raw = String(paramOf(req, "n"));
    return /^[1-9]$/.test(raw) ? Number(raw) : 0;
  };

  const send = async (
    res: Response,
    answer: Entry,
    n: number,
  ): Promise<void> => {
    const part = answer.parts?.[n - 1];
    const image = part ? await render(answer.photo, part) : null;
    if (!image) {
      fail(res, "not_found");
      return;
    }
    // Overrides can change today's answer, so the browser never keeps a part
    res.set("Cache-Control", "no-store");
    res.type("image/webp").send(image);
  };

  // Part n of today's answer
  app.get("/api/games/:slug/zoom/:n", async (req, res) => {
    res.set("Cache-Control", "no-store");
    const loaded = await loadGame(ctx, req, res);
    if (!loaded) {
      return;
    }
    if (loaded.game.kind !== "zoom") {
      fail(res, "not_found");
      return;
    }
    const { date, day } = todayOf(ctx, loaded.game);
    const answer = await todaysAnswer(ctx, res, loaded, date, day);
    if (answer) {
      await send(res, answer, partOf(req));
    }
  });

  // Part n of a party round's secret entry
  app.get("/api/parties/:code/zoom/:round/:n", async (req, res) => {
    res.set("Cache-Control", "no-store");
    const code = normalizeCode(String(paramOf(req, "code")));
    const party =
      code === null ? null : await findParty(ctx.pool, code, ctx.now());
    if (!party) {
      fail(res, "party_not_found");
      return;
    }
    const { game, roster, rounds } = await loadData(ctx.pool, party);
    const round = rounds.find(
      (r) => String(r.number) === String(paramOf(req, "round")),
    );
    const answer =
      round && roster.all.find((entry) => entry.id === round.answerId);
    if (game.kind !== "zoom" || !answer) {
      fail(res, "not_found");
      return;
    }
    await send(res, answer, partOf(req));
  });
}
