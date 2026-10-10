const LOCAL_STORAGE_USED_GUESSES_STRING: string = "usedGuesses";
const LOCAL_STORAGE_VICTORY_STRING: string = "victory";
const LOCAL_LAST_PLAYED_STRING: string = "lastPlayed";

// If an answer is chosen, it can't be chosen again for this amount of days
const ANSWER_SKIP_PERIOD: number = 5;

interface Pet {
  photo: string;
  name: string;
  colors: string[];
  owners: string[];
}

type AttributeValue = string | string[];

const GUESS_DATA: Pet[] = [
  {
    photo: "photos/ati.jpg",
    name: "Ati",
    colors: ["Black", "Orange", "White"],
    owners: ["Niki"],
  },
  {
    photo: "photos/bela.jpg",
    name: "Bela",
    colors: ["Black", "Grey", "White"],
    owners: ["Beti"],
  },
  {
    photo: "photos/cookie.jpg",
    name: "Cookie",
    colors: ["Black", "Orange", "White"],
    owners: ["Niki"],
  },
  {
    photo: "photos/dido.jpg",
    name: "Dido",
    colors: ["Grey", "White"],
    owners: ["Beti"],
  },
  {
    photo: "photos/eddie.jpg",
    name: "Eddie",
    colors: ["Orange", "White"],
    owners: ["Stefi", "Yasen"],
  },
  {
    photo: "photos/eli.jpg",
    name: "Eli",
    colors: ["Black", "Blue", "White"],
    owners: ["Beti"],
  },
  {
    photo: "photos/ilko.jpg",
    name: "Ilko",
    colors: ["Black", "Purple", "White"],
    owners: ["Beti"],
  },
  {
    photo: "photos/jaro.jpg",
    name: "Jaro",
    colors: ["Grey"],
    owners: ["Ico"],
  },
  {
    photo: "photos/jeffy.jpg",
    name: "Jeffy",
    colors: ["Grey"],
    owners: ["Ico"],
  },
  {
    photo: "photos/kiara.jpg",
    name: "Kiara",
    colors: ["Black", "Orange", "White"],
    owners: ["Antonio", "Tanya"],
  },
  {
    photo: "photos/kimi.jpg",
    name: "Kimi",
    colors: ["Black", "Orange", "White"],
    owners: ["Bori"],
  },
  {
    photo: "photos/mochi.jpg",
    name: "Mochi",
    colors: ["Orange", "White"],
    owners: ["Petya"],
  },
  {
    photo: "photos/murlin.jpg",
    name: "Murlin",
    colors: ["Grey"],
    owners: ["Antonio", "Tanya"],
  },
  {
    photo: "photos/oreo.jpg",
    name: "Oreo",
    colors: ["Black", "White"],
    owners: ["Cveti", "Vili"],
  },
  {
    photo: "photos/patio.jpg",
    name: "Patio",
    colors: ["Green", "Yellow"],
    owners: ["Beti"],
  },
  {
    photo: "photos/pipi.jpg",
    name: "Pipi",
    colors: ["Grey", "White"],
    owners: ["Beti"],
  },
  {
    photo: "photos/puhche.jpg",
    name: "Puhche",
    colors: ["Black", "White"],
    owners: ["Cveti", "Vili"],
  },
  {
    photo: "photos/sunny.jpg",
    name: "Sunny",
    colors: ["Yellow", "Blue"],
    owners: ["Beti"],
  },
  {
    photo: "photos/todorka.jpg",
    name: "Todorka",
    colors: ["Black", "White"],
    owners: ["Didi"],
  },
];

const GUESS_DATA_NAMES: string[] = GUESS_DATA.map(
  (item: Pet): string => item.name,
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

  Math.seedrandom(getCurrentDateString());
  initGame();
  loadInitialUsedGuessesElements();
  initButtons();
  initVictoryTitle();
  initNewGuessSubmit();
  setLastPlayed();
};

function getNewGuessInput(): HTMLInputElement {
  return document.querySelector<HTMLInputElement>("#new-guess-input")!;
}

function initGame(): void {
  const lastPlayed: Date = getLastPlayed();
  if (lastPlayed === null)
    return;

  const lastPlayedString: string = dateToString(lastPlayed);
  const todayString: string = dateToString(new Date());

  // If it's a new day, reset local storage
  if (lastPlayedString !== todayString) {
    clearIsVictory();
    clearUsedGuesses();
  }
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
  if (getIsVictory()) {
    addVictoryTitle();
  }
}

let cachedAnswerIdx: number | null = null;

function getAnswerIdx(): number {
  if (cachedAnswerIdx === null) {
    cachedAnswerIdx = generateAnswerIdx();
  }

  return cachedAnswerIdx;
}

function generateAnswerIdx(): number {
  const today: Date = new Date();

  const START_DATE: Date = new Date(2025, 7, 15);

  if (today < START_DATE) {
    console.log("Choose better start date");
    return generateRandomAnswerIdx();
  }

  let dateAnswers: number[] = [];
  let currentDate: Date = START_DATE;
  let currentDateIdx: number = 0;

  while (currentDate <= today) {
    let forbiddenAnswerIdxs: number[] = [];

    for (let i: number = 1; i <= ANSWER_SKIP_PERIOD; i++) {
      if (currentDateIdx - i < 0) break;

      forbiddenAnswerIdxs.push(dateAnswers[currentDateIdx - i]!);
    }

    let potentialIdx: number = generateRandomAnswerIdx();

    if (forbiddenAnswerIdxs.length >= GUESS_DATA.length) {
      console.error("Too big answer skip period!");
      return potentialIdx;
    }

    while (forbiddenAnswerIdxs.includes(potentialIdx)) {
      potentialIdx = (potentialIdx + 1) % GUESS_DATA.length;
    }

    dateAnswers.push(potentialIdx);
    currentDateIdx++;
    currentDate.setDate(currentDate.getDate() + 1);
  }

  console.log(dateAnswers);
  return dateAnswers[dateAnswers.length - 1]!;
}

function generateRandomAnswerIdx(): number {
  return Math.floor(Math.random() * GUESS_DATA.length);
}

function initButtons(): void {
  let submitNewGuessButton: HTMLButtonElement =
    document.querySelector<HTMLButtonElement>("#submit-new-guess-button")!;
  submitNewGuessButton.onclick = (): void => {
    handleSubmitSelection();
  };
}

function loadInitialUsedGuessesElements(): void {
  const usedGuesses: string[] | null = getUsedGuesses();
  if (usedGuesses === null)
    return;

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
  if (typeof val === "string") {
    if (val === answerVal) {
      resultCell.classList.add("correct");
    } else {
      resultCell.classList.add("incorrect");
    }
  } else if (val instanceof Array) {
    if (arraysAreSame(val, answerVal as string[])) {
      resultCell.classList.add("correct");
    } else if (arraysHaveCommonElement(val, answerVal as string[])) {
      resultCell.classList.add("partially-correct");
    } else {
      resultCell.classList.add("incorrect");
    }
  } else {
    console.error("Unsupported subelement type: ", typeof val);
  }
}

function handleAutocompleteSelection(event: AutoCompleteSelectionEvent): void {
  const newGuessInput: HTMLInputElement = getNewGuessInput();
  newGuessInput.value = event.detail.selection.value;
}

function handleSubmitSelection(): void {
  const newGuessInput: HTMLInputElement = getNewGuessInput();
  let selectedValue: string = newGuessInput.value;

  const selectedIndex: number = GUESS_DATA.findIndex(
    (item: Pet): boolean =>
      item.name.toLowerCase() === selectedValue.toLowerCase(),
  );
  if (selectedIndex === -1) {
    return;
  }

  // Close the autocomplete list
  autoCompleteJs?.close();

  // Set the selection to the proper name in case the casing of the selection was different from the proper name
  selectedValue = GUESS_DATA[selectedIndex]!.name;

  newGuessInput.value = "";

  // Prevent a value from being submitted again
  const usedGuesses: string[] | null = getUsedGuesses();
  if (usedGuesses !== null && usedGuesses.includes(selectedValue)) {
    return;
  }

  const answerIndex: number = getAnswerIdx();
  const isAnswer: boolean = selectedIndex === answerIndex;

  if (isAnswer) {
    setIsVictory();
    addVictoryTitle();
  }

  addUsedGuess(selectedValue);
  addGuessResultElement(selectedValue);
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
  let usedGuesses: string[] | null = getUsedGuesses();
  if (usedGuesses === null)
    return list;

  return list.filter((item: AutoCompleteItem): boolean => {
    return !usedGuesses.includes(item.value);
  });
}

function addUsedGuess(guess: string): void {
  let usedGuesses: string[] | null = getUsedGuesses();

  if (usedGuesses === null) {
    usedGuesses = [guess];
  } else {
    usedGuesses.push(guess);
  }

  localStorage.setItem(
    LOCAL_STORAGE_USED_GUESSES_STRING,
    JSON.stringify(usedGuesses),
  );
}

function clearUsedGuesses(): void {
  localStorage.removeItem(LOCAL_STORAGE_USED_GUESSES_STRING);
}

function getUsedGuesses(): string[] | null {
  return getLocalStorageObject<string[]>(LOCAL_STORAGE_USED_GUESSES_STRING);
}

function setIsVictory(): void {
  localStorage.setItem(LOCAL_STORAGE_VICTORY_STRING, JSON.stringify(true));
}

function clearIsVictory(): void {
  localStorage.removeItem(LOCAL_STORAGE_VICTORY_STRING);
}

function getIsVictory(): boolean | null {
  return getLocalStorageObject<boolean>(LOCAL_STORAGE_VICTORY_STRING);
}

function setLastPlayed(): void {
  localStorage.setItem(
    LOCAL_LAST_PLAYED_STRING,
    JSON.stringify(getCurrentDateString()),
  );
}

function getLastPlayed(): Date {
  const lastPlayedString: string | null = getLocalStorageObject<string>(
    LOCAL_LAST_PLAYED_STRING,
  );
  return new Date(Date.parse(lastPlayedString ?? ""));
}

function getLocalStorageObject<T>(key: string): T | null {
  let retrievedValue: string | null = localStorage.getItem(key);
  if (retrievedValue === null)
    return null;

  return JSON.parse(retrievedValue) as T;
}

function arraysHaveCommonElement(array1: string[], array2: string[]): boolean {
  for (let el1 of array1) {
    for (let el2 of array2) {
      if (el1 === el2) {
        return true;
      }
    }
  }

  return false;
}

function arraysAreSame(array1: string[], array2: string[]): boolean {
  return array1.sort().join(",") === array2.sort().join(",");
}

function getCurrentDate(): Date {
  return new Date();
}

function getCurrentDateString(): string {
  return dateToString(getCurrentDate());
}

function dateToString(date: Date): string {
  return "Y-m-d"
    .replace("Y", String(date.getFullYear()))
    .replace("m", String(date.getMonth() + 1))
    .replace("d", String(date.getDate()));
}
