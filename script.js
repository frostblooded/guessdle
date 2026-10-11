"use strict";
const GUESS_DATA_NAMES = GUESS_DATA.map((item) => item.name);
const gameState = createGameState(localStorage, () => new Date());
let autoCompleteJs = null;
window.onload = function () {
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
function getNewGuessInput() {
    return document.querySelector("#new-guess-input");
}
function initGame() {
    gameState.resetIfNewDay();
}
function initNewGuessSubmit() {
    let newGuessInput = getNewGuessInput();
    newGuessInput.onkeydown = (event) => {
        // When enter is pressed
        if (event.keyCode === 13) {
            handleSubmitSelection();
        }
    };
    newGuessInput.addEventListener("open", (_event) => {
        // Hack to fix a bug on mobile where if you click on the autocomplete list item, the autocomplete list opens again immediately
        const isValidGuess = GUESS_DATA.findIndex((item) => item.name === newGuessInput.value) !== -1;
        if (isValidGuess) {
            autoCompleteJs?.close();
        }
    });
}
function initVictoryTitle() {
    if (gameState.getIsVictory()) {
        addVictoryTitle();
    }
}
let cachedAnswerIdx = null;
function getAnswerIdx() {
    if (cachedAnswerIdx === null) {
        cachedAnswerIdx = generateAnswerIdx();
    }
    return cachedAnswerIdx;
}
function generateAnswerIdx() {
    const today = new Date();
    const dayNumber = getDayNumber(ANSWER_START_DATE, today);
    if (dayNumber < 0) {
        console.log("Choose better start date");
        return generateRandomAnswerIdx();
    }
    const answerSequence = generateAnswerSequence(GUESS_DATA.length, ANSWER_SKIP_PERIOD, dayNumber + 1, new Math.seedrandom(getAnswerSeed()));
    console.log(answerSequence);
    return answerSequence[answerSequence.length - 1];
}
function generateRandomAnswerIdx() {
    return Math.floor(Math.random() * GUESS_DATA.length);
}
function initButtons() {
    let submitNewGuessButton = document.querySelector("#submit-new-guess-button");
    submitNewGuessButton.onclick = () => {
        handleSubmitSelection();
    };
}
function loadInitialUsedGuessesElements() {
    const usedGuesses = gameState.getUsedGuesses();
    for (const usedGuess of usedGuesses) {
        addGuessResultElement(usedGuess);
    }
}
function addGuessResultElement(name) {
    let resultElement = document.createElement("div");
    resultElement.setAttribute("class", "guess-result-row row");
    const answerData = GUESS_DATA[getAnswerIdx()];
    const resultData = GUESS_DATA.find((item) => item.name === name);
    for (const key in resultData) {
        const attr = key;
        const val = resultData[attr];
        const formattedVal = getFormattedCellVal(val);
        let resultCell = document.createElement("div");
        resultCell.setAttribute("class", "guess-result-cell cell");
        if (key === "photo") {
            let image = document.createElement("img");
            image.src = val;
            resultCell.appendChild(image);
        }
        else {
            const answerVal = answerData[attr];
            resultCell.textContent = formattedVal;
            addGuessResultCellClasses(val, answerVal, resultCell);
        }
        resultElement.appendChild(resultCell);
    }
    let guessResultsContainer = document.querySelector("#guess-results-container");
    guessResultsContainer.prepend(resultElement);
}
function getFormattedCellVal(val) {
    if (val instanceof Array) {
        return val.join(", ");
    }
    return val;
}
function addGuessResultCellClasses(val, answerVal, resultCell) {
    resultCell.classList.add(correctnessClass(gradeCorrectness(val, answerVal)));
}
function handleAutocompleteSelection(event) {
    const newGuessInput = getNewGuessInput();
    newGuessInput.value = event.detail.selection.value;
}
function handleSubmitSelection() {
    const newGuessInput = getNewGuessInput();
    let selectedValue = newGuessInput.value;
    const selectedIndex = GUESS_DATA.findIndex((item) => item.name.toLowerCase() === selectedValue.toLowerCase());
    if (selectedIndex === -1) {
        return;
    }
    // Close the autocomplete list
    autoCompleteJs?.close();
    // Set the selection to the proper name in case the casing of the selection was different from the proper name
    selectedValue = GUESS_DATA[selectedIndex].name;
    newGuessInput.value = "";
    // Prevent a value from being submitted again
    if (gameState.getUsedGuesses().includes(selectedValue))
        return;
    const answerIndex = getAnswerIdx();
    const isAnswer = selectedIndex === answerIndex;
    if (isAnswer) {
        gameState.setIsVictory();
        addVictoryTitle();
    }
    gameState.addUsedGuess(selectedValue);
    addGuessResultElement(selectedValue);
}
function addVictoryTitle() {
    const answerName = GUESS_DATA[getAnswerIdx()].name;
    let victoryTitle = document.createElement("span");
    victoryTitle.id = "victory-title";
    victoryTitle.innerHTML =
        "YOU DID IT! THE ANSWER IS: <span id='victory-answer-name'>".concat(answerName, "</span>");
    let gameContainer = document.querySelector("#game-container");
    gameContainer.parentNode.insertBefore(victoryTitle, gameContainer);
}
function handleResultsList(list, data) {
    if (!data.results.length) {
        const message = document.createElement("div");
        message.setAttribute("class", "no_result");
        message.innerHTML = `<span>Found No Results for "${data.query}"</span>`;
        list.prepend(message);
    }
}
function filterOutGuesses(list) {
    // Filter out already used guesses
    const usedGuesses = gameState.getUsedGuesses();
    return list.filter((item) => {
        return !usedGuesses.includes(item.value);
    });
}
