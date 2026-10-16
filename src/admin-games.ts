// Admin "All games" tab: every game of any status, searchable, with Delete.
import { api } from "./manage-client.ts";

interface GameItem {
  slug: string;
  name: string;
  owner: string | null;
  status: string;
  entryCount: number;
}

const $ = <T extends HTMLElement>(selector: string): T =>
  document.querySelector<T>(selector)!;

// Returns the loader the tab calls each time it opens
export function initAllGames(): () => Promise<void> {
  const message = $("#games-message");
  const body = $("#all-games");
  const search = $<HTMLInputElement>("#games-search");
  const say = (text: string | null): void => {
    message.textContent = text ?? "";
    message.hidden = text === null;
  };

  const load = async (): Promise<void> => {
    say("Loading games…");
    const out = await api<{ games: GameItem[] }>(
      "GET",
      `/api/admin/games?q=${encodeURIComponent(search.value.trim())}`,
    );
    if (out?.status !== 200) {
      say("Could not load the games.");
      return;
    }
    say(out.data.games.length === 0 ? "No games match." : null);
    body.replaceChildren(...out.data.games.map(row));
  };

  const row = (game: GameItem): HTMLTableRowElement => {
    const tr = document.createElement("tr");
    tr.dataset["slug"] = game.slug;
    const slug = encodeURIComponent(game.slug);
    const cell = (...nodes: (Node | string)[]): void => {
      const td = document.createElement("td");
      td.append(...nodes);
      tr.append(td);
    };
    cell(
      Object.assign(document.createElement("a"), {
        href: `/g/${slug}`,
        textContent: game.name,
      }),
    );
    cell(game.owner ?? "");
    cell(game.status);
    cell(String(game.entryCount));
    cell(
      Object.assign(document.createElement("button"), {
        type: "button",
        className: "games-delete",
        textContent: "Delete",
        onclick: async (): Promise<void> => {
          if (!confirm(`Delete "${game.name}" and everything in it?`)) {
            return;
          }
          const out = await api("DELETE", `/api/admin/games/${slug}`);
          if (out?.status !== 200) {
            say("Could not delete that game. Reload and try again.");
            return;
          }
          await load();
        },
      }),
    );
    return tr;
  };

  let timer: ReturnType<typeof setTimeout> | undefined;
  search.oninput = (): void => {
    clearTimeout(timer);
    timer = setTimeout(() => void load(), 250);
  };
  return load;
}
