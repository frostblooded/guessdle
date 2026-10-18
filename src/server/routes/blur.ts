// A Blur game's images (ADR 0019): the board, the answer's image with only some squares clear,
// which is the only way it reaches a player before the day or round is over, and the gallery
// banner's blurred tiles. Both are rendered from the stored uploads, so their URLs stay secret.
import type { Express, Request, Response } from "express";
import type { Entry } from "../../game/game.ts";
import { normalizeCode } from "../../game/party.ts";
import { MAX_TILES } from "../../game/banner.ts";
import { blurRenderer, tileRenderer } from "../images.ts";
import { findParty, loadData } from "../parties.ts";
import type { GameRow } from "../games.ts";
import { openDay } from "../play-day.ts";
import {
  fail,
  loadGame,
  paramOf,
  queryOf,
  sendRefusal,
  type AppContext,
} from "./context.ts";

export function blurRoutes(
  app: Express,
  ctx: AppContext,
  uploadsDir: string,
): void {
  const render = blurRenderer(uploadsDir);
  const tile = tileRenderer(uploadsDir);
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
    const day = await openDay(ctx, loaded, queryOf(req)["day"]);
    if (!("refusal" in day)) {
      await send(req, res, day.game, day.answer);
    } else if (day.refusal === "no_such_day") {
      // An image that does not exist, rather than a day
      fail(res, "not_found");
    } else {
      sendRefusal(res, day);
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

  // Tile n of the gallery banner: the nth entry photo, by entry id, heavily blurred. Not a
  // secret, so browsers may keep it a while.
  app.get("/api/games/:slug/tile/:n", async (req, res) => {
    const loaded = await loadGame(ctx, req, res);
    if (!loaded) {
      return;
    }
    const n = Number(paramOf(req, "n"));
    const photo = loaded.roster.entries
      .map((entry) => entry.photo)
      .filter((p) => p !== "")[n];
    const image =
      loaded.game.kind === "blur" &&
      Number.isInteger(n) &&
      n < MAX_TILES &&
      photo
        ? await tile(photo)
        : null;
    if (!image) {
      fail(res, "not_found");
      return;
    }
    res.set("Cache-Control", "public, max-age=300");
    res.type("image/webp").send(image);
  });
}
