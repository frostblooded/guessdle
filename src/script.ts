import type autoComplete from "@tarekraafat/autocomplete.js";
import {
  findEntryId,
  type EntryRef,
  type GameAttribute,
  type GradedAttribute,
} from "./game/game.ts";
import { gameStorage } from "./game/game-state.ts";
import { FAILURES } from "./game/failures.ts";
import { MIN_ENTRIES } from "./game/limits.ts";
import { mergeLocalGame } from "./game/merge.ts";
import { createServerPlay } from "./game/server-play.ts";
import {
  createPlay,
  type GiveUpResult,
  type Loaded,
  type Play,
  type SubmitResult,
} from "./game/play.ts";
import {
  attachGuessInput,
  guessRowElement,
  showColumnTitles,
} from "./guess-board.ts";
import { showGameStatus, type StatusView } from "./play-status.ts";
import { browserFetch, initShell } from "./shell.ts";

const now = (): Date => new Date();

// /g/<slug>: the game this page plays
const SLUG = decodeURIComponent(location.pathname.split("/")[2] ?? "");

let roster: EntryRef[] = [];

// Renders the header at once; resolves to the signed-in user (or null)
const userPromise = initShell(browserFetch);

let play: Play;

let autoCompleteJs: autoComplete | null = null;

// What GET /api/games/:slug gives the Play page
type GameView = {
  name: string;
  canEdit: boolean;
  attributes: GameAttribute[];
  entries: EntryRef[];
} & StatusView;

// The game's attributes and entries, or null when it could not be loaded
async function loadGame(): Promise<GameView | "missing" | null> {
  try {
    const res = await fetch(`/api/games/${encodeURIComponent(SLUG)}`);
    if (res.status === 404) {
      return "missing";
    }
    return res.ok ? ((await res.json()) as GameView) : null;
  } catch {
    return null;
  }
}

window.onload = async function (): Promise<void> {
  const game = await loadGame();
  if (game === "missing") {
    document.querySelector("#game-title")!.textContent = "Game not found";
    document.querySelector("#game-lede")!.textContent =
      "There is no game at this address.";
    document.querySelector<HTMLElement>("#board")!.hidden = true;
    document.querySelector<HTMLElement>("#not-found")!.hidden = false;
    document.title = "Game not found - Guessdle";
    return;
  }
  if (game === null) {
    cannotPlay(
      "Could not load the game. Your connection may be down or the server may have a problem. Refresh the page; if it keeps failing, try again in a few minutes.",
    );
    return;
  }
  roster = game.entries;
  document.querySelector("#game-title")!.textContent = game.name;
  document.title = `${game.name} - Guessdle`;
  if (game.canEdit) {
    const edit = document.querySelector<HTMLAnchorElement>("#edit-link")!;
    edit.href = `/g/${encodeURIComponent(SLUG)}/edit`;
    edit.hidden = false;
  }
  showGameStatus(SLUG, game);
  showColumnTitles(game.attributes);
  // Only the owner and admins reach a game this small; there is no answer to draw
  if (roster.length < MIN_ENTRIES) {
    cannotPlay(
      `${FAILURES.not_enough_entries.text} It has ${roster.length} now.`,
    );
    return;
  }
  // Party mode (issue #90): friends play this game against each other, each on their phone
  const party = document.querySelector<HTMLAnchorElement>("#party-host-link")!;
  party.href = `/party?host=${encodeURIComponent(SLUG)}`;
  party.hidden = false;
  const storage = gameStorage(localStorage, SLUG);
  // Signed-in players use the server-stored game instead
  play = createPlay({
    slug: SLUG,
    roster,
    storage,
    now,
    fetch: browserFetch,
    onNewDay: clearBoard,
  });
  autoCompleteJs = attachGuessInput(roster, () => play.getUsedGuesses());

  initButtons();
  initNewGuessSubmit();
  void start();
};

// Who is signed in decides where the game lives, so ask before loading it
async function start(): Promise<void> {
  if ((await userPromise) !== null) {
    const merged = await mergeLocalGame(
      SLUG,
      gameStorage(localStorage, SLUG),
      now,
      browserFetch,
    );
    if (merged === "rate_limited") {
      showNotice(RATE_LIMITED);
    }
    play = createServerPlay({
      slug: SLUG,
      fetch: browserFetch,
      onNewDay: clearBoard,
    });
  }
  await loadInitialUsedGuessesElements();
}

function getNewGuessInput(): HTMLInputElement {
  return document.querySelector<HTMLInputElement>("#new-guess-input")!;
}

function initNewGuessSubmit(): void {
  const newGuessInput: HTMLInputElement = getNewGuessInput();

  newGuessInput.onkeydown = (event: KeyboardEvent): void => {
    // When enter is pressed
    if (event.keyCode === 13) {
      void handleSubmitSelection();
    }
  };
}

// The game cannot be played on this page view: say why and leave nothing on the board usable
function cannotPlay(reason: string): void {
  document.querySelector("#board")!.removeAttribute("aria-busy");
  document.querySelector<HTMLElement>("#loading-state")!.hidden = true;
  showNotice(reason);
  const controls = [
    "#new-guess-input",
    "#submit-new-guess-button",
    "#give-up-button",
    "#reset-guesses-button",
    "#reset-button",
  ];
  for (const id of controls) {
    document.querySelector<HTMLInputElement | HTMLButtonElement>(id)!.disabled =
      true;
  }
}

// The buttons ship disabled so a click before the game has loaded is not silently lost
function initButtons(): void {
  for (const id of ["#submit-new-guess-button", "#give-up-button"]) {
    document.querySelector<HTMLButtonElement>(id)!.disabled = false;
  }
  document.querySelector<HTMLButtonElement>(
    "#submit-new-guess-button",
  )!.onclick = (): void => {
    void handleSubmitSelection();
  };
  document.querySelector<HTMLButtonElement>("#give-up-button")!.onclick =
    (): void => {
      void handleGiveUp();
    };
  for (const id of ["#reset-button", "#reset-guesses-button"]) {
    document.querySelector<HTMLButtonElement>(id)!.onclick = (): void => {
      void handleReset();
    };
  }
}

// Native modal dialog: focus trap, Escape and focus return come for free
function confirmReset(): Promise<boolean> {
  const dialog = document.querySelector<HTMLDialogElement>("#reset-dialog")!;
  dialog.returnValue = "";
  return new Promise((resolve) => {
    dialog.addEventListener(
      "close",
      (): void => resolve(dialog.returnValue === "confirm"),
      { once: true },
    );
    dialog.showModal();
  });
}

async function handleReset(): Promise<void> {
  if ((await confirmReset()) && (await play.reset())) {
    clearBoard();
  }
}

// Empties the board and shows the guess input again
function clearBoard(): void {
  document.querySelector("#guess-results-container")!.replaceChildren();
  document.querySelector("#result-banner")!.replaceChildren();
  setFinished(false);
  refreshEmptyState();
}

// A finished game (won or gave up) swaps guessing for the reset button
function setFinished(finished: boolean): void {
  document.querySelector<HTMLElement>("#new-guess-row")!.hidden = finished;
  document.querySelector<HTMLElement>("#give-up-button")!.hidden = finished;
  document.querySelector<HTMLElement>("#reset-guesses-button")!.hidden =
    finished;
  document.querySelector<HTMLElement>("#reset-button")!.hidden = !finished;
}

const RATE_LIMITED =
  "Too many requests in a short time. Wait a minute, then try again.";
const GUESS_FAILED =
  "Your guess could not be checked because the server did not answer. It is still in the box: press Enter to try again.";
const GIVE_UP_FAILED =
  "Could not reveal the answer because the server did not answer. Try again in a moment.";

// A short message above the guess box; null hides it
function showNotice(text: string | null): void {
  const notice = document.querySelector<HTMLElement>("#notice")!;
  notice.textContent = text ?? "";
  notice.hidden = text === null;
}

async function handleGiveUp(): Promise<void> {
  const result: GiveUpResult = await play.giveUp();
  showNotice(
    result.kind === "rate_limited"
      ? RATE_LIMITED
      : result.kind === "error"
        ? GIVE_UP_FAILED
        : null,
  );
  if (result.kind === "gaveUp") {
    showBanner("give-up", result.answer);
    setFinished(true);
  }
}

// The result card above the guesses: the answer's photo and name
function showBanner(kind: "victory" | "give-up", answerName: string): void {
  const banner = document.createElement("div");
  banner.id = kind === "victory" ? "victory-title" : "give-up-title";
  banner.className = `banner banner-${kind}`;
  const photo = roster.find((entry) => entry.name === answerName)?.photo;
  if (photo) {
    const image = document.createElement("img");
    image.src = photo;
    image.alt = "";
    banner.append(image);
  }
  const text = document.createElement("div");
  const heading = document.createElement("strong");
  heading.textContent =
    kind === "victory" ? "You did it!" : "Better luck tomorrow";
  const line = document.createElement("span");
  line.append(kind === "victory" ? "The answer is " : "The answer was ");
  const name = document.createElement("span");
  name.id = kind === "victory" ? "victory-answer-name" : "give-up-answer-name";
  name.textContent = answerName;
  line.append(name);
  text.append(heading, line);
  banner.append(text);
  document.querySelector("#result-banner")!.replaceChildren(banner);
}

function refreshEmptyState(): void {
  const empty =
    document.querySelector("#guess-results-container")!.childElementCount === 0;
  document.querySelector<HTMLElement>("#empty-state")!.hidden = !empty;
  // Nothing to reset until a guess is made
  document.querySelector<HTMLButtonElement>("#reset-guesses-button")!.disabled =
    empty;
}

async function loadInitialUsedGuessesElements(): Promise<void> {
  const loaded: Loaded | null = await play.load();
  if (loaded === null) {
    refreshEmptyState();
    cannotPlay(
      "Could not load your game. Your connection may be down or the server may have a problem. Refresh the page; if it keeps failing, try again in a few minutes.",
    );
    return;
  }
  document.querySelector("#board")!.removeAttribute("aria-busy");
  document.querySelector<HTMLElement>("#loading-state")!.hidden = true;

  for (const row of loaded.rows) {
    addGuessResultElement(row);
  }
  if (loaded.victory && loaded.answer !== undefined) {
    showBanner("victory", loaded.answer);
  } else if (loaded.gaveUp && loaded.answer !== undefined) {
    showBanner("give-up", loaded.answer);
  }
  setFinished(loaded.victory || loaded.gaveUp === true);
  refreshEmptyState();
}

function addGuessResultElement(row: GradedAttribute[]): void {
  document
    .querySelector("#guess-results-container")!
    .prepend(guessRowElement(row));
}

let submitting: boolean = false;

async function handleSubmitSelection(): Promise<void> {
  const newGuessInput: HTMLInputElement = getNewGuessInput();
  const id: number | null = findEntryId(roster, newGuessInput.value);
  if (id === null || submitting) {
    return;
  }

  submitting = true;
  let result: SubmitResult;
  try {
    result = await play.submit(id);
  } finally {
    submitting = false;
  }
  showNotice(
    result.kind === "rate_limited"
      ? RATE_LIMITED
      : result.kind === "error"
        ? GUESS_FAILED
        : null,
  );
  // The typed guess stays when the server could not grade it, to retry
  if (
    result.kind === "rate_limited" ||
    result.kind === "invalid" ||
    result.kind === "error" ||
    result.kind === "finished"
  ) {
    return;
  }

  autoCompleteJs?.close();
  newGuessInput.value = "";
  if (result.kind === "duplicate") {
    return;
  }

  if (result.isAnswer && result.answer !== undefined) {
    showBanner("victory", result.answer);
    setFinished(true);
  }
  addGuessResultElement(result.row);
  refreshEmptyState();
}
