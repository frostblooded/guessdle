import autoComplete from "@tarekraafat/autocomplete.js";
import seedrandom from "seedrandom";
import "../styles.css";
import "@tarekraafat/autocomplete.js/dist/css/autoComplete.css";
import { correctnessClass } from "./game/correctness.ts";
import {
  createGame,
  type Game,
  type GradedAttribute,
  type GuessResult,
} from "./game/game.ts";
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

const game: Game = createGame({
  roster: GUESS_DATA,
  storage: localStorage,
  now: (): Date => new Date(),
  makeRandom: (seed: string): (() => number) => seedrandom(seed),
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

  loadInitialUsedGuessesElements();
  initButtons();
  initVictoryTitle();
  initNewGuessSubmit();
};

function getNewGuessInput(): HTMLInputElement {
  return document.querySelector<HTMLInputElement>("#new-guess-input")!;
}

function initNewGuessSubmit(): void {
  const newGuessInput: HTMLInputElement = getNewGuessInput();

  newGuessInput.onkeydown = (event: KeyboardEvent): void => {
    // When enter is pressed
    if (event.keyCode === 13) {
      handleSubmitSelection();
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

function initVictoryTitle(): void {
  if (game.getIsVictory()) {
    addVictoryTitle();
  }
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
    handleSubmitSelection();
  };
  initHelpDialog();
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

function loadInitialUsedGuessesElements(): void {
  for (const row of game.getRows()) {
    addGuessResultElement(row);
  }
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

function handleSubmitSelection(): void {
  const newGuessInput: HTMLInputElement = getNewGuessInput();
  const result: GuessResult = game.submit(newGuessInput.value);
  if (result.kind === "invalid") {
    return;
  }

  autoCompleteJs?.close();
  newGuessInput.value = "";
  if (result.kind === "duplicate") {
    return;
  }

  if (result.isAnswer) {
    addVictoryTitle();
  }
  addGuessResultElement(result.row);
}

function addVictoryTitle(): void {
  const answerName: string = game.getAnswerName();

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
  const usedGuesses: string[] = game.getUsedGuesses();
  return list.filter((item: AutoCompleteItem): boolean => {
    return !usedGuesses.includes(item.value);
  });
}
