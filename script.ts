import autoComplete from "@tarekraafat/autocomplete.js";
import seedrandom from "seedrandom";
import "@tarekraafat/autocomplete.js/dist/css/autoComplete.css";
import {
  type AttributeValue,
  correctnessClass,
  gradeCorrectness,
} from "./correctness.ts";
import { computeAnswerIdx, type GuessResult, submitGuess } from "./game.ts";
import { createGameState, type GameState } from "./game-state.ts";
import { GUESS_DATA, type Pet } from "./roster.ts";
import type {
  AutoCompleteItem,
  AutoCompleteResults,
  AutoCompleteSelectionEvent,
} from "@tarekraafat/autocomplete.js";

const GUESS_DATA_NAMES: string[] = GUESS_DATA.map(
  (item: Pet): string => item.name,
);

const gameState: GameState = createGameState(
  localStorage,
  (): Date => new Date(),
);

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

  initGame();
  loadInitialUsedGuessesElements();
  initButtons();
  initVictoryTitle();
  initNewGuessSubmit();
  gameState.setLastPlayed();
};

function getNewGuessInput(): HTMLInputElement {
  return document.querySelector<HTMLInputElement>("#new-guess-input")!;
}

function initGame(): void {
  gameState.resetIfNewDay();
}

function initNewGuessSubmit(): void {
  let newGuessInput: HTMLInputElement = getNewGuessInput();

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
  if (gameState.getIsVictory()) {
    addVictoryTitle();
  }
}

let cachedAnswerIdx: number | null = null;

function getAnswerIdx(): number {
  cachedAnswerIdx ??= computeAnswerIdx(
    GUESS_DATA.length,
    new Date(),
    (seed: string): (() => number) => seedrandom(seed),
  );
  return cachedAnswerIdx;
}

function initButtons(): void {
  let submitNewGuessButton: HTMLButtonElement =
    document.querySelector<HTMLButtonElement>("#submit-new-guess-button")!;
  submitNewGuessButton.onclick = (): void => {
    handleSubmitSelection();
  };
}

function loadInitialUsedGuessesElements(): void {
  const usedGuesses: string[] = gameState.getUsedGuesses();
  for (const usedGuess of usedGuesses) {
    addGuessResultElement(usedGuess);
  }
}

function addGuessResultElement(name: string): void {
  let resultElement: HTMLDivElement = document.createElement("div");
  resultElement.setAttribute("class", "guess-result-row row");

  const answerData: Pet = GUESS_DATA[getAnswerIdx()]!;
  const resultData: Pet = GUESS_DATA.find(
    (item: Pet): boolean => item.name === name,
  )!;

  for (const key in resultData) {
    const attr = key as keyof Pet;
    const val: AttributeValue = resultData[attr];
    const formattedVal: string = getFormattedCellVal(val);

    let resultCell: HTMLDivElement = document.createElement("div");
    resultCell.setAttribute("class", "guess-result-cell cell");

    if (key === "photo") {
      let image: HTMLImageElement = document.createElement("img");
      image.src = val as string;
      resultCell.appendChild(image);
    } else {
      const answerVal: AttributeValue = answerData[attr];
      resultCell.textContent = formattedVal;
      addGuessResultCellClasses(val, answerVal, resultCell);
    }

    resultElement.appendChild(resultCell);
  }

  let guessResultsContainer: Element = document.querySelector(
    "#guess-results-container",
  )!;
  guessResultsContainer.prepend(resultElement);
}

function getFormattedCellVal(val: AttributeValue): string {
  if (val instanceof Array) {
    return val.join(", ");
  }

  return val;
}

function addGuessResultCellClasses(
  val: AttributeValue,
  answerVal: AttributeValue,
  resultCell: HTMLElement,
): void {
  resultCell.classList.add(correctnessClass(gradeCorrectness(val, answerVal)));
}

function handleAutocompleteSelection(event: AutoCompleteSelectionEvent): void {
  const newGuessInput: HTMLInputElement = getNewGuessInput();
  newGuessInput.value = event.detail.selection.value;
}

function handleSubmitSelection(): void {
  const newGuessInput: HTMLInputElement = getNewGuessInput();
  const result: GuessResult = submitGuess(
    gameState,
    GUESS_DATA,
    getAnswerIdx(),
    newGuessInput.value,
  );
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
  addGuessResultElement(result.name);
}

function addVictoryTitle(): void {
  const answerName: string = GUESS_DATA[getAnswerIdx()]!.name;

  let victoryTitle: HTMLSpanElement = document.createElement("span");
  victoryTitle.id = "victory-title";
  victoryTitle.innerHTML =
    "YOU DID IT! THE ANSWER IS: <span id='victory-answer-name'>".concat(
      answerName,
      "</span>",
    );

  let gameContainer: Element = document.querySelector("#game-container")!;
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
  const usedGuesses: string[] = gameState.getUsedGuesses();
  return list.filter((item: AutoCompleteItem): boolean => {
    return !usedGuesses.includes(item.value);
  });
}
