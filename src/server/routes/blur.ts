// What a Blur or Sequence game shows of the answer before the day or round is over: a Blur
// board (ADR 0019), the answer's image with only some squares clear, or a Sequence photo
// (ADR 0020), one of those unlocked so far; also Blur and Sequence gallery banner tiles. All are
// sent from the stored uploads, so their URLs stay secret.
import { readFile } from "node:fs/promises";
import type { Express, Request, Response } from "express";
import type { GameKind } from "../../game/blur.ts";
import type { Entry } from "../../game/game.ts";
import { normalizeCode } from "../../game/party.ts";
import { MAX_TILES } from "../../game/banner.ts";
import { blurRenderer, fileOf, tileRenderer } from "../images.ts";
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

type Send = (
  req: Request,
  res: Response,
  game: GameRow,
  answer: Entry,
) => Promise<void>;

export function blurRoutes(
  app: Express,
  ctx: AppContext,
  uploadsDir: string,
): void {
  const render = blurRenderer(uploadsDir);
  const tile = tileRenderer(uploadsDir);
  // How many squares are clear, or which photo, 1-9 from the URL, or 0
  const shownOf = (req: Request): number => {
    const raw = String(paramOf(req, "n"));
    return /^[1-9]$/.test(raw) ? Number(raw) : 0;
  };

  const image = (res: Response, webp: Buffer | null): void => {
    if (!webp) {
      fail(res, "not_found");
      return;
    }
    // Overrides can change today's answer, so the browser never keeps one
    res.set("Cache-Control", "no-store");
    res.type("image/webp").send(webp);
  };

  const board: Send = async (req, res, game, answer) => {
    const shown = shownOf(req);
    const order = answer.blurOrder;
    image(
      res,
      order && shown >= 1 && shown <= game.blurTries
        ? await render(answer.photo, order.slice(0, shown))
        : null,
    );
  };

  // An upload's bytes as stored, or null
  const stored = async (url: string): Promise<Buffer | null> => {
    const file = fileOf(uploadsDir, url);
    return file ? await readFile(file).catch(() => null) : null;
  };

  const shot: Send = async (req, res, game, answer) => {
    const n = shownOf(req);
    image(
      res,
      n >= 1 && n <= game.blurTries
        ? await stored(answer.shots?.[n - 1] ?? "")
        : null,
    );
  };

  // Today's answer, or a past day's (`?day=N`)
  const dayRoute =
    (kind: GameKind, send: Send) =>
    async (req: Request, res: Response): Promise<void> => {
      res.set("Cache-Control", "no-store");
      const loaded = await loadGame(ctx, req, res);
      if (!loaded) {
        return;
      }
      if (loaded.game.kind !== kind) {
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
    };

  // A party round's secret entry
  const roundRoute =
    (kind: GameKind, send: Send) =>
    async (req: Request, res: Response): Promise<void> => {
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
      if (game.kind !== kind || !answer) {
        fail(res, "not_found");
        return;
      }
      await send(req, res, game, answer);
    };

  // n squares clear
  app.get("/api/games/:slug/blur/:n", dayRoute("blur", board));
  app.get("/api/parties/:code/blur/:round/:n", roundRoute("blur", board));
  // Photo n of the sequence
  app.get("/api/games/:slug/shot/:n", dayRoute("sequence", shot));
  app.get("/api/parties/:code/shot/:round/:n", roundRoute("sequence", shot));

  // Tile n of the gallery banner: the nth entry photo, by entry id, heavily blurred for a Blur
  // game, a Sequence game's first photo as stored. Not a secret, so browsers may keep it a while.
  app.get("/api/games/:slug/tile/:n", async (req, res) => {
    const loaded = await loadGame(ctx, req, res);
    if (!loaded) {
      return;
    }
    const n = Number(paramOf(req, "n"));
    const { kind } = loaded.game;
    const photo = loaded.roster.entries
      .map((entry) =>
        kind === "sequence" ? (entry.shots?.[0] ?? "") : entry.photo,
      )
      .filter((p) => p !== "")[n];
    const image =
      !Number.isInteger(n) || n >= MAX_TILES || !photo
        ? null
        : kind === "blur"
          ? await tile(photo)
          : kind === "sequence"
            ? await stored(photo)
            : null;
    if (!image) {
      fail(res, "not_found");
      return;
    }
    res.set("Cache-Control", "public, max-age=300");
    res.type("image/webp").send(image);
  });
}
