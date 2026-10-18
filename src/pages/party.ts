// /party: enter a code; /party?host=<slug>: open a party on a game; /party/<CODE>: the
// party itself, live over its socket, and its results once it ends (ADR 0016).
import type autoComplete from "@tarekraafat/autocomplete.js";
import qrcode from "qrcode-generator";
import { findEntryId, type EntryRef } from "../game/game.ts";
import {
  normalizeCode,
  REFUSAL_TEXT,
  type PartyView,
  type ServerMessage,
} from "../game/party.ts";
import { MAX_NICKNAME } from "../game/limits.ts";
import {
  attachGuessInput,
  guessRowElement,
  showColumnTitles,
} from "../guess-board.ts";
import { api, errorText, signInThen } from "../manage-client.ts";
import { openPartySocket, type PartySocket } from "../party-socket.ts";
import { renderHistory, renderPlayers, renderPodium } from "../party-render.ts";
import { browserFetch, initShell } from "../shell.ts";

const $ = <T extends HTMLElement>(selector: string): T =>
  document.querySelector<T>(selector)!;
const show = (selector: string, visible: boolean): void => {
  $(selector).hidden = !visible;
};

// The phone's player token for a party; storage may be blocked, then it lasts this page view
const tokens = new Map<string, string>();
const tokenKey = (code: string): string => `party:${code}`;
const getToken = (code: string): string | null => {
  try {
    return localStorage.getItem(tokenKey(code)) ?? tokens.get(code) ?? null;
  } catch {
    return tokens.get(code) ?? null;
  }
};
const setToken = (code: string, token: string | null): void => {
  if (token === null) {
    tokens.delete(code);
  } else {
    tokens.set(code, token);
  }
  try {
    if (token === null) {
      localStorage.removeItem(tokenKey(code));
    } else {
      localStorage.setItem(tokenKey(code), token);
    }
  } catch {
    // blocked storage: the in-memory copy above
  }
};

const showError = (text: string): void => {
  $("#party-error").textContent = text;
};

const userPromise = initShell(browserFetch);
const params = new URLSearchParams(location.search);
const pathCode = decodeURIComponent(location.pathname.split("/")[2] ?? "");
const hostSlug = params.get("host");

if (pathCode !== "") {
  void openParty(pathCode);
} else if (hostSlug !== null) {
  void hostForm(hostSlug);
} else {
  codeForm();
}

function codeForm(): void {
  show("#code-form", true);
  $("#party-title").textContent = "Join a party";
  $<HTMLFormElement>("#code-form").onsubmit = (event: SubmitEvent): void => {
    event.preventDefault();
    const code = normalizeCode($<HTMLInputElement>("#code-input").value);
    if (code === null) {
      showError("A party code is 4 letters, such as KWZP.");
      return;
    }
    location.assign(`/party/${code}`);
  };
}

async function hostForm(slug: string): Promise<void> {
  const user = await userPromise;
  if (user === null) {
    signInThen(`/party?host=${encodeURIComponent(slug)}`);
    return;
  }
  const game = await api("GET", `/api/games/${encodeURIComponent(slug)}`);
  if (game?.status !== 200) {
    showError(errorText(game));
    return;
  }
  $("#party-title").textContent = `Host a ${String(game.data["name"])} party`;
  $("#party-lede").textContent =
    "You play too. Friends join from their phones with the code or QR you get next.";
  const nickname = $<HTMLInputElement>("#host-nickname");
  nickname.value = [...user.name].slice(0, MAX_NICKNAME).join("");
  show("#host-form", true);
  $<HTMLFormElement>("#host-form").onsubmit = async (
    event: SubmitEvent,
  ): Promise<void> => {
    event.preventDefault();
    showError("");
    const button = $<HTMLButtonElement>("#host-button");
    button.disabled = true;
    const reply = await api(
      "POST",
      `/api/games/${encodeURIComponent(slug)}/parties`,
      { nickname: nickname.value },
    );
    if (reply?.status === 201) {
      const code = String(reply.data["code"]);
      setToken(code, String(reply.data["token"]));
      location.assign(`/party/${code}`);
      return;
    }
    showError(errorText(reply));
    button.disabled = false;
  };
}

async function openParty(raw: string): Promise<void> {
  const code = normalizeCode(raw);
  const first = code === null ? null : await api("GET", `/api/parties/${code}`);
  if (code === null || first?.status === 404) {
    showError(
      "There is no party with this code. Check the code and try again.",
    );
    codeForm();
    return;
  }
  if (first?.status !== 200) {
    showError(errorText(first));
    return;
  }
  const initial = first.data as unknown as PartyView;
  show("#party", true);
  render(code, initial);
  if (initial.ended) {
    return;
  }
  const socket = openPartySocket(code, () => getToken(code), {
    message: (msg: ServerMessage): void => onMessage(code, msg),
    connected: (up: boolean): void => show("#connection", !up),
    removed: (): void => {
      setToken(code, null);
      showNotice("The host removed you from the party. You can join again.");
    },
  });
  wire(code, socket);
}

let current: PartyView | null = null;
let party: PartySocket | null = null;
let complete: autoComplete | null = null;

function onMessage(code: string, msg: ServerMessage): void {
  if (msg.type === "view") {
    render(code, msg.view);
  } else if (msg.type === "error") {
    showNotice(REFUSAL_TEXT[msg.error] ?? REFUSAL_TEXT.server_error);
  }
}

function showNotice(text: string | null): void {
  const notice = $("#notice");
  notice.textContent = text ?? "";
  notice.hidden = text === null;
}

const entries = (): EntryRef[] => current?.game.entries ?? [];

// The buttons and forms, wired once; they act on the latest view
function wire(code: string, socket: PartySocket): void {
  party = socket;
  $<HTMLFormElement>("#join-form").onsubmit = async (
    event: SubmitEvent,
  ): Promise<void> => {
    event.preventDefault();
    showError("");
    const button = $<HTMLButtonElement>("#join-button");
    button.disabled = true;
    const reply = await api("POST", `/api/parties/${code}/join`, {
      nickname: $<HTMLInputElement>("#join-nickname").value,
    });
    button.disabled = false;
    if (reply?.status === 201) {
      setToken(code, String(reply.data["token"]));
      socket.restart();
      return;
    }
    showError(errorText(reply));
  };
  const guess = (): void => {
    const input = $<HTMLInputElement>("#new-guess-input");
    const id = findEntryId(entries(), input.value);
    if (id === null) {
      showNotice("Pick a name from the list.");
      return;
    }
    if (socket.send({ type: "guess", entryId: id })) {
      showNotice(null);
      input.value = "";
      complete?.close();
    }
  };
  $<HTMLButtonElement>("#submit-new-guess-button").onclick = guess;
  $<HTMLInputElement>("#new-guess-input").onkeydown = (
    event: KeyboardEvent,
  ): void => {
    if (event.key === "Enter") {
      guess();
    }
  };
  $<HTMLButtonElement>("#give-up-button").onclick = (): void => {
    socket.send({ type: "give-up" });
  };
  $<HTMLButtonElement>("#start-round").onclick = (): void => {
    socket.send({ type: "start-round" });
  };
  $<HTMLButtonElement>("#end-round").onclick = (): void => {
    socket.send({ type: "end-round" });
  };
  $<HTMLButtonElement>("#end-party").onclick = (): void => {
    const dialog = $<HTMLDialogElement>("#end-dialog");
    dialog.returnValue = "";
    dialog.addEventListener(
      "close",
      (): void => {
        if (dialog.returnValue === "confirm") {
          socket.send({ type: "end-party" });
        }
      },
      { once: true },
    );
    dialog.showModal();
  };
  $<HTMLButtonElement>("#copy-link").onclick = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(partyUrl(code));
      $("#copy-link").textContent = "Copied";
    } catch {
      $("#copy-link").textContent = "Copy the address above";
    }
  };
}

const partyUrl = (code: string): string => `${location.origin}/party/${code}`;

let qrFor = "";
function drawInvite(code: string): void {
  $("#party-code").textContent = code;
  const link = $<HTMLAnchorElement>("#party-link");
  link.href = `/party/${code}`;
  link.textContent = `${location.host}/party/${code}`;
  if (qrFor !== code) {
    qrFor = code;
    const qr = qrcode(0, "M");
    qr.addData(partyUrl(code));
    qr.make();
    // The library builds the SVG from the URL alone, which is this site's own address
    $("#qr").innerHTML = qr.createSvgTag({
      cellSize: 4,
      margin: 2,
      scalable: true,
    });
  }
}

function render(code: string, view: PartyView): void {
  const firstView = current === null;
  current = view;
  document.title = `${view.game.name} party - Guessdle`;
  $("#party-title").textContent = view.ended
    ? `${view.game.name} party: final standings`
    : `${view.game.name} party`;
  $("#party-lede").textContent = view.ended
    ? "This party has ended. These results stay at this link for 30 days."
    : view.you
      ? "Everyone guesses the same secret entry. Fewest guesses wins the round; ties go to whoever finished first."
      : "Pick a nickname to join. You can play the round that is going on right now.";
  drawInvite(code);
  const round = view.round;
  const live = round?.live === true;
  show("#invite", !view.ended);
  $("#invite").classList.toggle("invite-compact", live);
  show("#join-form", !view.ended && view.you === null);
  if (firstView && view.you === null) {
    $<HTMLInputElement>("#join-nickname").focus();
  }

  const host = view.you?.host === true && !view.ended;
  show("#host-controls", host);
  show("#start-round", !live);
  show("#end-round", live);
  $("#start-round").textContent =
    round === null ? "Start round 1" : `Start round ${round.number + 1}`;

  $("#players").replaceChildren(
    ...renderPlayers(view, (player) => {
      if (confirm(`Remove ${player.nickname} from the party?`)) {
        party?.send({ type: "remove-player", playerId: player.id });
      }
    }),
  );
  show("#podium", view.ended && view.players.length > 0);
  $("#podium").replaceChildren(...(view.ended ? renderPodium(view) : []));
  show("#history", view.history.length > 0);
  $("#history-list").replaceChildren(...renderHistory(view));

  const waiting = view.ended
    ? null
    : round === null
      ? host
        ? "Start the first round once everyone has joined."
        : "Waiting for the host to start the first round."
      : !live
        ? host
          ? `Round ${round.number} is over. Start the next one when everyone is ready.`
          : `Round ${round.number} is over. Waiting for the host to start the next one.`
        : null;
  $("#waiting").textContent = waiting ?? "";
  show("#waiting", waiting !== null);
  renderBoard(view);
}

// The viewer's own guesses in the live round
function renderBoard(view: PartyView): void {
  const round = view.round;
  const mine = round?.live === true ? round.yours : null;
  show("#round", mine !== null);
  if (!mine || !round) {
    return;
  }
  $("#round-title").textContent = `Round ${round.number}`;
  if (complete === null) {
    showColumnTitles(view.game.attributes);
    complete = attachGuessInput(entries, () =>
      (current?.round?.yours?.rows ?? []).map(
        (row) => findEntryId(entries(), String(row[1]!.value)) ?? -1,
      ),
    );
  }
  const done = mine.solved || mine.gaveUp;
  show("#guess-card", !done);
  show("#board", mine.rows.length > 0);
  $("#guess-results-container").replaceChildren(
    ...mine.rows.map(guessRowElement).reverse(),
  );
  const banner = $("#result-banner");
  banner.replaceChildren();
  if (done && mine.answer) {
    const card = document.createElement("div");
    card.className = `banner banner-${mine.solved ? "victory" : "give-up"}`;
    if (mine.answer.photo) {
      const photo = document.createElement("img");
      photo.src = mine.answer.photo;
      photo.alt = "";
      card.append(photo);
    }
    const text = document.createElement("div");
    const heading = document.createElement("strong");
    heading.textContent = mine.solved
      ? `Solved in ${mine.rows.length} ${mine.rows.length === 1 ? "guess" : "guesses"}!`
      : "You gave up";
    const line = document.createElement("span");
    line.textContent = `The answer is ${mine.answer.name}. Waiting for the others to finish.`;
    text.append(heading, line);
    card.append(text);
    banner.append(card);
  }
}
