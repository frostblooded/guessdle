// A Blur game's board (ADR 0019): the answer's image with only some squares clear, the only way
// it reaches a player before the day or round is over. Boards are rendered from the stored
// upload, so the image's own URL stays secret.
import type { Express, Request, Response } from "express";
import type { Entry } from "../../game/game.ts";
import { normalizeCode } from "../../game/party.ts";
import { blurRenderer } from "../images.ts";
import { findParty, loadData } from "../parties.ts";
import type { GameRow } from "../games.ts";
import {
  dayOf,
  fail,
  loadGame,
  paramOf,
  todaysAnswer,
  type AppContext,
} from "./context.ts";

export function blurRoutes(
  app: Express,
  ctx: AppContext,
  uploadsDir: string,
): void {
  const render = blurRenderer(uploadsDir);
  // How many squares are clear, 1-9 from the URL, or 0
  const shownOf = (req: Request): number => {
    const raw = String(paramOf(req, "n"));
    return /^[1-9]$/.test(raw) ? Number(raw) : 0;
  };

  const send = async (
    req: Request,
    res: Response,
    game: GameRow,
    answer: Entry,
  ): Promise<void> => {
    const shown = shownOf(req);
    const order = answer.blurOrder;
    const image =
      order && shown >= 1 && shown <= game.blurTries
        ? await render(answer.photo, order.slice(0, shown))
        : null;
    if (!image) {
      fail(res, "not_found");
      return;
    }
    // Overrides can change today's answer, so the browser never keeps a board
    res.set("Cache-Control", "no-store");
    res.type("image/webp").send(image);
  };

  // Today's answer with n squares clear, or a past day's (`?day=N`)
  app.get("/api/games/:slug/blur/:n", async (req, res) => {
    res.set("Cache-Control", "no-store");
    const loaded = await loadGame(ctx, req, res);
    if (!loaded) {
      return;
    }
    if (loaded.game.kind !== "blur") {
      fail(res, "not_found");
      return;
    }
    const played = dayOf(ctx, req, loaded.game);
    if (!played) {
      fail(res, "not_found");
      return;
    }
    const { date, day } = played;
    const answer = await todaysAnswer(ctx, res, loaded, date, day);
    if (answer) {
      await send(req, res, loaded.game, answer);
    }
  });

  // A party round's secret entry with n squares clear
  app.get("/api/parties/:code/blur/:round/:n", async (req, res) => {
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
    if (game.kind !== "blur" || !answer) {
      fail(res, "not_found");
      return;
    }
    await send(req, res, game, answer);
  });
}
