// Admin Queue tab: pending games oldest first, each with a play link, Approve, Reject and Delete.
import { api } from "./manage-client.ts";

interface QueueItem {
  slug: string;
  name: string;
  owner: string | null;
  entryCount: number;
  since: string;
}

const $ = <T extends HTMLElement>(selector: string): T =>
  document.querySelector<T>(selector)!;

// Returns the loader the tab calls each time it opens
export function initQueue(): () => Promise<void> {
  const message = $("#queue-message");
  const body = $("#queue-games");
  const say = (text: string | null): void => {
    message.textContent = text ?? "";
    message.hidden = text === null;
  };

  const load = async (): Promise<void> => {
    say("Loading the queue…");
    const out = await api<{ games: QueueItem[] }>("GET", "/api/admin/queue");
    if (out?.status !== 200) {
      say(
        "Could not load the queue. Your connection or the server may be failing, or your admin session may have ended. Reload the page and try again.",
      );
      return;
    }
    say(out.data.games.length === 0 ? "No games are waiting." : null);
    body.replaceChildren(...out.data.games.map(row));
  };

  // Runs one review call, then reloads the list
  const act = async (
    method: "POST" | "DELETE",
    path: string,
    payload?: unknown,
  ): Promise<void> => {
    const out = await api(method, `/api/admin/games/${path}`, payload ?? {});
    if (out?.status !== 200) {
      say(
        "The review action did not go through. Another admin may have handled this game already, or the server may be failing. Reload the queue to see its current state.",
      );
      return;
    }
    await load();
  };

  const row = (game: QueueItem): HTMLTableRowElement => {
    const tr = document.createElement("tr");
    tr.dataset["slug"] = game.slug;
    const cell = (text: string): void => {
      tr.append(
        Object.assign(document.createElement("td"), { textContent: text }),
      );
    };
    const slug = encodeURIComponent(game.slug);
    const name = document.createElement("td");
    name.append(
      Object.assign(document.createElement("a"), {
        href: `/g/${slug}`,
        textContent: game.name,
        className: "queue-play",
      }),
    );
    tr.append(name);
    cell(game.owner ?? "");
    cell(String(game.entryCount));
    cell(new Date(game.since).toLocaleString());
    const actions = document.createElement("td");
    const button = (label: string, run: () => void): void => {
      actions.append(
        Object.assign(document.createElement("button"), {
          type: "button",
          className: `queue-${label.toLowerCase()}`,
          textContent: label,
          onclick: run,
        }),
        " ",
      );
    };
    button("Approve", () => void act("POST", `${slug}/approve`));
    button("Reject", () => {
      const reason = prompt(`Why is "${game.name}" rejected?`)?.trim();
      if (reason) {
        void act("POST", `${slug}/reject`, { reason });
      }
    });
    button("Delete", () => {
      if (confirm(`Delete "${game.name}" and everything in it?`)) {
        void act("DELETE", slug);
      }
    });
    tr.append(actions);
    return tr;
  };

  return load;
}
