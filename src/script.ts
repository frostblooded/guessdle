import autoComplete from "@tarekraafat/autocomplete.js";
import "../styles.css";
import "@tarekraafat/autocomplete.js/dist/css/autoComplete.css";
import {
  fetchUser,
  signOut,
  type AccountFetch,
  type AccountUser,
} from "./account.ts";
import { correctnessClass } from "./game/correctness.ts";
import { findPetId, type GradedAttribute } from "./game/game.ts";
import {
  createPlay,
  type GiveUpResult,
  type Loaded,
  type Play,
  type SubmitResult,
} from "./game/play.ts";
import { GUESS_DATA, type Pet } from "./game/roster.ts";
import { initTheme } from "./theme.ts";
import type {
  AutoCompleteItem,
  AutoCompleteResults,
  AutoCompleteSelectionEvent,
} from "@tarekraafat/autocomplete.js";

const GUESS_DATA_NAMES: string[] = GUESS_DATA.map(
  (item: Pet): string => item.name,
);

const play: Play = createPlay({
  roster: GUESS_DATA,
  storage: localStorage,
  now: (): Date => new Date(),
  fetch: (url, init) => fetch(url, init),
  onNewDay: clearBoard,
});

let autoCompleteJs: autoComplete | null = null;

window.onload = function (): void {
  autoCompleteJs = new autoComplete({
    selector: "#new-guess-input",
    placeHolder: "Guess a pet...",
    data: {
      src: GUESS_DATA_NAMES,
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
  void loadInitialUsedGuessesElements();
};

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
      GUESS_DATA.findIndex(
        (item: Pet): boolean => item.name === newGuessInput.value,
      ) !== -1;

    if (isValidGuess) {
      autoCompleteJs?.close();
    }
  });
}

function initButtons(): void {
  initTheme(
    document.documentElement,
    document.querySelector<HTMLButtonElement>("#theme-button")!,
    localStorage,
  );
  const submitNewGuessButton: HTMLButtonElement =
    document.querySelector<HTMLButtonElement>("#submit-new-guess-button")!;
  submitNewGuessButton.onclick = (): void => {
    void handleSubmitSelection();
  };
  document.querySelector<HTMLButtonElement>("#give-up-button")!.onclick =
    (): void => {
      void handleGiveUp();
    };
  document.querySelector<HTMLButtonElement>("#reset-button")!.onclick =
    (): void => {
      play.reset();
      clearBoard();
    };
  initHelpDialog();
  document.querySelector<HTMLButtonElement>("#logout-button")!.onclick =
    (): void => {
      void handleLogout();
    };
  void fetchUser(fetchLike).then(showAccount);
}

const fetchLike: AccountFetch = (url, init) => fetch(url, init);

function showAccount(user: AccountUser | null): void {
  const name: HTMLElement =
    document.querySelector<HTMLElement>("#account-name")!;
  name.textContent = user === null ? "" : user.name;
  name.hidden = user === null;
  document.querySelector<HTMLElement>("#login-link")!.hidden = user !== null;
  document.querySelector<HTMLElement>("#logout-button")!.hidden = user === null;
}

// Signing out also forgets the local game, so the next person starts clean
async function handleLogout(): Promise<void> {
  if (await signOut(fetchLike)) {
    play.reset();
    clearBoard();
    showAccount(null);
  }
}

// Empties the board and shows the guess input again
function clearBoard(): void {
  document.querySelector("#guess-results-container")!.replaceChildren();
  document.querySelector("#victory-title")?.remove();
  document.querySelector("#give-up-title")?.remove();
  setFinished(false);
}

// A finished game (won or gave up) swaps guessing for the reset button
function setFinished(finished: boolean): void {
  document.querySelector<HTMLElement>("#new-guess-row")!.hidden = finished;
  document.querySelector<HTMLElement>("#give-up-button")!.hidden = finished;
  document.querySelector<HTMLElement>("#reset-button")!.hidden = !finished;
}

async function handleGiveUp(): Promise<void> {
  const result: GiveUpResult = await play.giveUp();
  if (result.kind === "gaveUp") {
    addGiveUpTitle(result.answer);
    setFinished(true);
  }
}

function addGiveUpTitle(answerName: string): void {
  if (document.querySelector("#give-up-title")) {
    return;
  }

  const title: HTMLSpanElement = document.createElement("span");
  title.id = "give-up-title";
  title.append("THE ANSWER WAS: ");
  const name: HTMLSpanElement = document.createElement("span");
  name.id = "give-up-answer-name";
  name.textContent = answerName;
  title.append(name);
  const gameContainer: Element = document.querySelector("#game-container")!;
  gameContainer.parentNode!.insertBefore(title, gameContainer);
}

function initHelpDialog(): void {
  const dialog: HTMLDialogElement =
    document.querySelector<HTMLDialogElement>("#help-dialog")!;
  const steps: HTMLElement[] = [
    ...dialog.querySelectorAll<HTMLElement>(".help-step"),
  ];
  const prev: HTMLButtonElement =
    document.querySelector<HTMLButtonElement>("#help-prev")!;
  const next: HTMLButtonElement =
    document.querySelector<HTMLButtonElement>("#help-next")!;
  const count: HTMLElement =
    document.querySelector<HTMLElement>("#help-count")!;
  let current = 0;

  const show = (index: number): void => {
    current = index;
    steps.forEach((step: HTMLElement, i: number): void => {
      step.hidden = i !== current;
    });
    prev.disabled = current === 0;
    next.disabled = current === steps.length - 1;
    count.textContent = `${current + 1} / ${steps.length}`;
  };

  prev.onclick = (): void => show(current - 1);
  next.onclick = (): void => show(current + 1);
  document.querySelector<HTMLButtonElement>("#help-button")!.onclick =
    (): void => {
      show(0);
      dialog.showModal();
    };
}

async function loadInitialUsedGuessesElements(): Promise<void> {
  const loaded: Loaded | null = await play.load();
  if (loaded === null) {
    return;
  }

  for (const row of loaded.rows) {
    addGuessResultElement(row);
  }
  if (loaded.victory && loaded.answer !== undefined) {
    addVictoryTitle(loaded.answer);
  } else if (loaded.gaveUp && loaded.answer !== undefined) {
    addGiveUpTitle(loaded.answer);
  }
  setFinished(loaded.victory || loaded.gaveUp === true);
}

function addGuessResultElement(row: GradedAttribute[]): void {
  const resultElement: HTMLDivElement = document.createElement("div");
  resultElement.setAttribute("class", "guess-result-row row");

  for (const { key, value, correctness } of row) {
    const resultCell: HTMLDivElement = document.createElement("div");
    resultCell.setAttribute("class", "guess-result-cell cell");

    if (key === "photo") {
      const image: HTMLImageElement = document.createElement("img");
      image.src = value as string;
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
  const id: string | null = findPetId(GUESS_DATA, newGuessInput.value);
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
  // The typed guess stays when the server could not grade it, to retry
  if (
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
    addVictoryTitle(result.answer);
    setFinished(true);
  }
  addGuessResultElement(result.row);
}

function addVictoryTitle(answerName: string): void {
  if (document.querySelector("#victory-title")) {
    return;
  }

  const victoryTitle: HTMLSpanElement = document.createElement("span");
  victoryTitle.id = "victory-title";
  victoryTitle.innerHTML =
    "YOU DID IT! THE ANSWER IS: <span id='victory-answer-name'>".concat(
      answerName,
      "</span>",
    );

  const gameContainer: Element = document.querySelector("#game-container")!;
  gameContainer.parentNode!.insertBefore(victoryTitle, gameContainer);
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
  const usedIds: string[] = play.getUsedGuesses();
  return list.filter((item: AutoCompleteItem): boolean => {
    const id: string | null = findPetId(GUESS_DATA, item.value);
    return id === null || !usedIds.includes(id);
  });
}
