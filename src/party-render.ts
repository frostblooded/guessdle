// Draws a party view: the scoreboard, the podium and the finished rounds.
import { correctnessClass } from "./game/correctness.ts";
import {
  ordinal,
  progressLabel,
  type FinishedRound,
  type PartyView,
  type Standing,
} from "./game/party.ts";

const el = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  text?: string,
): HTMLElementTagNameMap[K] => {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) {
    node.textContent = text;
  }
  return node;
};

const points = (n: number): string => `${n} ${n === 1 ? "point" : "points"}`;

const nameOf = (view: PartyView, id: number): string =>
  view.players.find((p) => p.id === id)?.nickname ?? "Removed player";

// The scoreboard: place, nickname, points, and the live round's progress. The host gets Remove buttons.
export function renderPlayers(
  view: PartyView,
  onRemove: (player: Standing) => void,
): HTMLElement[] {
  const live = view.round?.live === true ? view.round : null;
  return view.players.map((player) => {
    const row = el("li", "party-player");
    row.dataset["playerId"] = String(player.id);
    const name = el("span", "party-player-name", player.nickname);
    if (player.id === view.you?.playerId) {
      name.append(el("span", "fine-print", " (you)"));
    }
    if (player.host) {
      name.append(" ", el("span", "badge", "Host"));
    }
    const progress = live?.progress.find((p) => p.playerId === player.id);
    const detail = el(
      "span",
      `party-player-detail${progress?.solved ? " solved" : ""}`,
      progress ? progressLabel(progress) : "",
    );
    row.append(
      el("span", "party-place", ordinal(player.place)),
      name,
      detail,
      el("span", "party-points", points(player.points)),
    );
    if (view.you?.host && !player.host && !view.ended) {
      const remove = el("button", "btn btn-quiet btn-sm", "Remove");
      remove.type = "button";
      remove.setAttribute("aria-label", `Remove ${player.nickname}`);
      remove.onclick = (): void => onRemove(player);
      row.append(remove);
    }
    return row;
  });
}

// The top three of an ended party
export function renderPodium(view: PartyView): HTMLElement[] {
  return view.players
    .filter((p) => p.place <= 3)
    .slice(0, 3)
    .map((p) => {
      const step = el("div", `podium-step podium-${p.place}`);
      step.append(
        el("span", "podium-place", ordinal(p.place)),
        el("strong", "podium-name", p.nickname),
        el("span", "fine-print", points(p.points)),
      );
      return step;
    });
}

// One finished round: its answer, then each player's place, points and guesses
function renderRound(view: PartyView, round: FinishedRound): HTMLElement {
  const card = el("article", "card party-round");
  const head = el("div", "party-round-head");
  if (round.answer.photo) {
    const photo = el("img", "party-round-photo");
    photo.src = round.answer.photo;
    photo.alt = "";
    head.append(photo);
  }
  const title = el("div", "");
  title.append(
    el("h3", "", `Round ${round.number}`),
    el("p", "fine-print", `The answer was ${round.answer.name}`),
  );
  head.append(title);
  const list = el("ol", "party-results");
  for (const result of round.results) {
    const row = el("li", "party-result");
    const place = result.place === null ? "–" : ordinal(result.place);
    const outcome = result.solved
      ? `${result.guesses} ${result.guesses === 1 ? "guess" : "guesses"}`
      : result.gaveUp
        ? "Gave up"
        : "Did not solve";
    const summary = el("div", "party-result-summary");
    summary.append(
      el("span", "party-place", place),
      el("strong", "party-player-name", nameOf(view, result.playerId)),
      el("span", "party-player-detail", outcome),
      el("span", "party-points", `+${result.points}`),
    );
    const guesses = el("div", "party-guesses");
    result.grades.forEach((grades, i) => {
      const line = el("div", "party-guess");
      const squares = el("span", "party-squares");
      squares.setAttribute("aria-hidden", "true");
      // Skip the photo column: it repeats the name's grade
      for (const grade of grades.slice(1)) {
        squares.append(el("span", `party-square ${correctnessClass(grade)}`));
      }
      line.append(squares, el("span", "", result.guessNames[i] ?? ""));
      guesses.append(line);
    });
    row.append(summary, guesses);
    list.append(row);
  }
  card.append(head, list);
  return card;
}

export const renderHistory = (view: PartyView): HTMLElement[] =>
  view.history.map((round) => renderRound(view, round));
