import autoComplete from "@tarekraafat/autocomplete.js";
import "@tarekraafat/autocomplete.js/dist/css/autoComplete.css";
import { correctnessClass } from "./game/correctness.ts";
import {
  findEntryId,
  type EntryRef,
  type GameAttribute,
  type GradedAttribute,
} from "./game/game.ts";
import { gameStorage } from "./game/game-state.ts";
import { mergeLocalGame } from "./game/merge.ts";
import { createServerPlay } from "./game/server-play.ts";
import {
  createPlay,
  type GiveUpResult,
  type Loaded,
  type Play,
  type SubmitResult,
} from "./game/play.ts";
import { browserFetch, initShell } from "./shell.ts";
import type {
  AutoCompleteItem,
  AutoCompleteResults,
  AutoCompleteSelectionEvent,
} from "@tarekraafat/autocomplete.js";

const now = (): Date => new Date();

// The Play page plays game 1 until the gallery routes games by slug
const SLUG = "petdle";

let roster: EntryRef[] = [];

// Renders the header at once; resolves to the signed-in user (or null)
const userPromise = initShell(browserFetch);

let play: Play;

let autoCompleteJs: autoComplete | null = null;

// The game's attributes and entries, or null when it could not be loaded
async function loadGame(): Promise<{
  attributes: GameAttribute[];
  entries: EntryRef[];
} | null> {
  try {
    const res = await fetch(`/api/games/${SLUG}`);
    return res.ok
      ? ((await res.json()) as {
          attributes: GameAttribute[];
          entries: EntryRef[];
        })
      : null;
  } catch {
    return null;
  }
}

function showColumnTitles(attributes: GameAttribute[]): void {
  document.querySelector("#guess-results-titles-row")!.replaceChildren(
    ...["Photo", "Name", ...attributes.map((a) => a.name)].map((title) => {
      const cell = document.createElement("div");
      cell.className = "guess-result-title cell";
      cell.textContent = title;
      return cell;
    }),
  );
}

window.onload = async function (): Promise<void> {
  const game = await loadGame();
  if (game === null) {
    document.querySelector("#board")!.removeAttribute("aria-busy");
    document.querySelector<HTMLElement>("#loading-state")!.hidden = true;
    showNotice("Could not load the game. Check your connection and refresh.");
    return;
  }
  roster = game.entries;
  showColumnTitles(game.attributes);
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
  autoCompleteJs = new autoComplete({
    selector: "#new-guess-input",
    placeHolder: "Guess a pet...",
    data: {
      src: roster.map((item: EntryRef): string => item.name),
      filter: filterOutGuesses,
    },
    resultsList: {
      element: handleResultsList,
      noResults: true,
    },
    resultItem: {
      highlight: true,
    },
    events: {
      input: {
        selection: handleAutocompleteSelection,
      },
    },
  });

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

  newGuessInput.addEventListener("open", (_event: Event): void => {
    // Hack to fix a bug on mobile where if you click on the autocomplete list item, the autocomplete list opens again immediately
    const isValidGuess: boolean =
      roster.findIndex(
        (item: EntryRef): boolean => item.name === newGuessInput.value,
      ) !== -1;

    if (isValidGuess) {
      autoCompleteJs?.close();
    }
  });
}

function initButtons(): void {
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

const RATE_LIMITED = "Too many requests, wait a moment";

// A short message above the guess box; null hides it
function showNotice(text: string | null): void {
  const notice = document.querySelector<HTMLElement>("#notice")!;
  notice.textContent = text ?? "";
  notice.hidden = text === null;
}

async function handleGiveUp(): Promise<void> {
  const result: GiveUpResult = await play.giveUp();
  showNotice(result.kind === "rate_limited" ? RATE_LIMITED : null);
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
  document.querySelector("#board")!.removeAttribute("aria-busy");
  document.querySelector<HTMLElement>("#loading-state")!.hidden = true;
  if (loaded === null) {
    showNotice("Could not load your game. Check your connection and refresh.");
    refreshEmptyState();
    return;
  }

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
  const resultElement: HTMLDivElement = document.createElement("div");
  resultElement.setAttribute("class", "guess-result-row row");

  for (const [i, { value, correctness }] of row.entries()) {
    const resultCell: HTMLDivElement = document.createElement("div");
    resultCell.setAttribute("class", "guess-result-cell cell");

    if (i === 0) {
      const image: HTMLImageElement = document.createElement("img");
      image.src = value as string;
      image.alt = "";
      resultCell.appendChild(image);
    } else {
      resultCell.textContent = Array.isArray(value) ? value.join(", ") : value;
      resultCell.classList.add(correctnessClass(correctness));
    }

    resultElement.appendChild(resultCell);
  }

  const guessResultsContainer: Element = document.querySelector(
    "#guess-results-container",
  )!;
  guessResultsContainer.prepend(resultElement);
}

function handleAutocompleteSelection(event: AutoCompleteSelectionEvent): void {
  const newGuessInput: HTMLInputElement = getNewGuessInput();
  newGuessInput.value = event.detail.selection.value;
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
  showNotice(result.kind === "rate_limited" ? RATE_LIMITED : null);
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

function handleResultsList(list: HTMLElement, data: AutoCompleteResults): void {
  if (!data.results.length) {
    const message: HTMLDivElement = document.createElement("div");
    message.setAttribute("class", "no_result");
    message.innerHTML = `<span>Found No Results for "${data.query}"</span>`;
    list.prepend(message);
  }
}

function filterOutGuesses(list: AutoCompleteItem[]): AutoCompleteItem[] {
  // Filter out already used guesses
  const usedIds: number[] = play.getUsedGuesses();
  return list.filter((item: AutoCompleteItem): boolean => {
    const id: number | null = findEntryId(roster, item.value);
    return id === null || !usedIds.includes(id);
  });
}
