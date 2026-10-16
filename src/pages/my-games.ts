import { api, signInThen } from "../manage-client.ts";
import { browserFetch, initShell } from "../shell.ts";

interface Mine {
  slug: string;
  name: string;
  status: string;
  rejectReason: string;
  entryCount: number;
}

const show = (selector: string, visible: boolean): void => {
  document.querySelector<HTMLElement>(selector)!.hidden = !visible;
};

function row(game: Mine): HTMLLIElement {
  const item = document.createElement("li");
  item.className = "mine-row card";
  const title = document.createElement("strong");
  title.textContent = game.name;
  const status = document.createElement("span");
  status.className = "badge";
  status.textContent = game.status;
  const slug = encodeURIComponent(game.slug);
  const edit = document.createElement("a");
  edit.href = `/g/${slug}/edit`;
  edit.textContent = "Edit";
  const play = document.createElement("a");
  play.href = `/g/${slug}`;
  play.textContent = "View";
  const note = document.createElement("span");
  note.className = "fine-print";
  note.textContent = `${game.entryCount} entries${game.rejectReason ? `. Rejected: ${game.rejectReason}` : ""}`;
  item.append(title, status, note, edit, play);
  return item;
}

void initShell(browserFetch).then(async (user) => {
  if (user === null) {
    signInThen("/my-games");
    return;
  }
  const reply = await api<Mine[]>("GET", "/api/my-games");
  show("#mine-loading", false);
  if (reply?.status !== 200) {
    show("#mine-error", true);
    return;
  }
  show("#mine-empty", reply.data.length === 0);
  document.querySelector("#mine")!.replaceChildren(...reply.data.map(row));
});
