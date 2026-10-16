// The game page shell (/g/<slug>) with the game's link-preview meta injected.
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Express, Request } from "express";
import { isPlayable, resolveGame } from "../access.ts";
import { paramOf, type AppContext } from "./context.ts";

const escapeHtml = (text: string): string =>
  text.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );

const meta = (attr: string, key: string, value: string): string =>
  `<meta ${attr}="${key}" content="${escapeHtml(value)}" />`;

export function shellRoutes(
  app: Express,
  { pool, now }: AppContext,
  shellDir: string,
): void {
  // The slug is not a path here (the shell is read from a fixed file). Express has already decoded it once; decoding again threw on e.g. /g/%25zz
  app.get(/^\/g\/([^/]+)$/, async (req: Request, res) => {
    const slug = String(paramOf(req, "0"));
    const loaded = await resolveGame(pool, now, req, slug, "play");
    const visible = typeof loaded !== "string";

    const origin = `${req.protocol}://${req.get("host")}`;
    const tags: string[] = [];
    if (visible) {
      const { game, roster } = loaded;
      const title = `${game.name} - Guessdle`;
      tags.push(
        `<title>${escapeHtml(title)}</title>`,
        meta("name", "description", game.description),
        meta("property", "og:type", "website"),
        meta("property", "og:title", title),
        meta("property", "og:description", game.description),
        meta("property", "og:url", `${origin}/g/${encodeURIComponent(slug)}`),
      );
      if (game.coverUrl) {
        tags.push(
          meta("property", "og:image", new URL(game.coverUrl, origin).href),
        );
      }
      if (game.status !== "approved" || !isPlayable(game, roster)) {
        tags.push(meta("name", "robots", "noindex"));
      }
    } else {
      tags.push("<title>Game not found - Guessdle</title>");
      tags.push(meta("name", "robots", "noindex"));
    }
    const html = (await readFile(join(shellDir, "game.html"), "utf8")).replace(
      "<title>Guessdle</title>",
      () => tags.join("\n    "),
    );
    res
      .status(visible ? 200 : 404)
      .set({ "Cache-Control": "no-cache", "Content-Type": "text/html" })
      .send(html);
  });
}
