import { gameBanner } from "../banner.ts";
import { browserFetch, initShell } from "../shell.ts";

interface Card {
  slug: string;
  name: string;
  description: string;
  cover: string;
  photos: string[];
  entryCount: number;
}

function cardElement(card: Card, first: boolean): HTMLLIElement {
  const item = document.createElement("li");
  item.className = first ? "game-card game-card-featured" : "game-card";
  const link = document.createElement("a");
  link.href = `/g/${encodeURIComponent(card.slug)}`;
  const banner = gameBanner(card.cover, card.photos);
  if (banner) {
    link.append(banner);
  }
  const body = document.createElement("div");
  body.className = "game-card-body";
  const name = document.createElement("h2");
  name.textContent = card.name;
  if (first) {
    const badge = document.createElement("span");
    badge.className = "badge";
    badge.textContent = "Original";
    name.append(" ", badge);
  }
  const description = document.createElement("p");
  description.textContent = card.description;
  const count = document.createElement("p");
  count.className = "fine-print";
  count.textContent = `${card.entryCount} entries`;
  body.append(name, description, count);
  link.append(body);
  item.append(link);
  return item;
}

void initShell(browserFetch);

async function show(): Promise<void> {
  try {
    const res = await fetch("/api/games");
    if (!res.ok) {
      throw new Error(String(res.status));
    }
    const cards = (await res.json()) as Card[];
    document.querySelector("#gallery")!.replaceChildren(
      // The API lists the original game first
      ...cards.map((card, i) =>
        cardElement(card, i === 0 && card.slug === "petdle"),
      ),
    );
  } catch {
    document.querySelector<HTMLElement>("#gallery-error")!.hidden = false;
  }
  document.querySelector<HTMLElement>("#gallery-loading")!.hidden = true;
}

void show();
