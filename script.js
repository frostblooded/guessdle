const FILTER = new URLSearchParams(window.location.search).get("filter");

const LOCAL_STORAGE_USED_GUESSES_STRING = "usedGuesses_".concat(FILTER);
const LOCAL_STORAGE_ANSWER_IDX_STRING = "answerIdX_".concat(FILTER);
const LOCAL_STORAGE_VICTORY_STRING = "victory_".concat(FILTER);

const UBISOFT_FILTER = "ubisoft";
const APOLLO_FILTER = "apollo";

const UBISOFT_FILTER_URL = "/?filter=".concat(UBISOFT_FILTER);
const APOLLO_FILTER_URL = "/?filter=".concat(APOLLO_FILTER);

const ALL_GUESS_DATA = [
    {
        photo: "photos/ati.jpg",
        name: "Ati",
        colors: ["Black", "White", "Orange"],
        owners: ["Niki"],
        filters: [UBISOFT_FILTER, APOLLO_FILTER],
    },
    {
        photo: "photos/cookie.jpg",
        name: "Cookie",
        colors: ["Black", "White", "Orange"],
        owners: ["Niki"],
        filters: [UBISOFT_FILTER, APOLLO_FILTER],
    },
    {
        photo: "photos/eddie.jpg",
        name: "Eddie",
        colors: ["Orange", "White"],
        owners: ["Stefi", "Yasen"],
        filters: [APOLLO_FILTER],
    },
    {
        photo: "photos/jaro.jpg",
        name: "Jaro",
        colors: ["Black"],
        owners: ["Ico"],
        filters: [APOLLO_FILTER],
    },
    {
        photo: "photos/jeffy.jpg",
        name: "Jeffy",
        colors: ["Black"],
        owners: ["Ico"],
        filters: [APOLLO_FILTER],
    },
    {
        photo: "photos/kiara.jpg",
        name: "Kiara",
        colors: ["Black", "White", "Orange"],
        owners: ["Antonio", "Tanya"],
        filters: [APOLLO_FILTER],
    },
    {
        photo: "photos/kimi.jpg",
        name: "Kimi",
        colors: ["Black", "White", "Orange"],
        owners: ["Bori"],
    },
    {
        photo: "photos/mochi.jpg",
        name: "Mochi",
        colors: ["Orange", "White"],
        owners: ["Petya"],
        filters: [UBISOFT_FILTER],
    },
    {
        photo: "photos/murlin.jpg",
        name: "Murlin",
        colors: ["Black"],
        owners: ["Antonio", "Tanya"],
        filters: [APOLLO_FILTER],
    },
    {
        photo: "photos/oreo.jpg",
        name: "Oreo",
        colors: ["Black", "White"],
        owners: ["Cveti", "Vili"],
        filters: [UBISOFT_FILTER],
    },
    {
        photo: "photos/puhche.jpg",
        name: "Puhche",
        colors: ["Black", "White"],
        owners: ["Cveti", "Vili"],
        filters: [UBISOFT_FILTER],
    },
    {
        photo: "photos/todorka.jpg",
        name: "Todorka",
        colors: ["Black", "White"],
        owners: ["Didi"],
        filters: [APOLLO_FILTER],
    },
];

const GUESS_DATA = (() => {
    if(FILTER === null)
        return ALL_GUESS_DATA;

    return ALL_GUESS_DATA.filter((item) => {
        if(!Object.hasOwn(item, "filters"))
            return false;

        return item.filters.includes(FILTER);
    });
})();

const GUESS_DATA_NAMES = GUESS_DATA.map(item => item.name);

let autoCompleteJs = null;

window.onload = function() {
    autoCompleteJs = new autoComplete({
        selector: "#new-guess-input",
        placeHolder: "Guess a cat...",
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
            }
        }
    });

    loadInitialUsedGuessesElements();
    initButtons();
    initAnswerIdx();
    initVictoryTitle();
    initNewGuessSubmit();
}

function initNewGuessSubmit() {
    let newGuessInput = document.querySelector("#new-guess-input");

    newGuessInput.onkeydown = event => {
        // When enter is pressed
        if(event.keyCode === 13) {
            handleSubmitSelection();
        }
    };
}

function initVictoryTitle() {
    if(getIsVictory()) {
        addVictoryTitle();
    }
}

function initAnswerIdx() {
    const answerIdx = getAnswerIdx();
    if(answerIdx != null)
        return;

    setRandomAnswerIdx();
}

function initButtons() {
    let resetButton = document.querySelector("#reset-game-button");
    resetButton.onclick = onResetButtonClick;

    let noFilterButton = document.querySelector("#no-filter-button");
    noFilterButton.onclick = () => { window.location.href = "/"; };

    if(FILTER === null) {
        noFilterButton.classList.add("active");
    }

    let ubisoftFilterButton = document.querySelector("#ubisoft-filter-button");
    ubisoftFilterButton.onclick = () => { window.location.href = UBISOFT_FILTER_URL; };

    if(FILTER === UBISOFT_FILTER) {
        ubisoftFilterButton.classList.add("active");
    }

    let apolloFilterButton = document.querySelector("#apollo-filter-button");
    apolloFilterButton.onclick = () => { window.location.href = APOLLO_FILTER_URL; };

    if(FILTER === APOLLO_FILTER) {
        apolloFilterButton.classList.add("active");
    }

    let submitNewGuessButton = document.querySelector("#submit-new-guess-button");
    submitNewGuessButton.onclick = () => { handleSubmitSelection(); };
}

function onResetButtonClick() {
    setRandomAnswerIdx();
    clearUsedGuesses();
    clearIsVictory();

    let guessResultRows = document.querySelectorAll(".guess-result-row");

    for (let row of guessResultRows) {
        row.remove();
    }

    let victoryTitle = document.querySelector("#victory-title");
    if(victoryTitle != null) {
        victoryTitle.remove();
    }
}

function loadInitialUsedGuessesElements() {
    const usedGuesses = getUsedGuesses();
    if(usedGuesses === null)
        return;

    for(const usedGuess of usedGuesses) {
        addGuessResultElement(usedGuess);
    }
}

function addGuessResultElement(name) {
    let resultElement = document.createElement("div");
    resultElement.setAttribute("class", "guess-result-row row");

    const answerData = GUESS_DATA[getAnswerIdx()];
    const resultData = GUESS_DATA.find(item => item.name === name);

    for (const key in resultData) {
        if (key === "filters")
            continue;

        const val = resultData[key];
        const formattedVal = getFormattedCellVal(val);

        let resultCell = document.createElement("div");
        resultCell.setAttribute("class", "guess-result-cell cell");

        if (key === "photo") {
            let image = document.createElement("img");
            image.src = val;
            resultCell.appendChild(image);
        } else {
            const answerVal = answerData[key];
            resultCell.textContent = formattedVal;
            addGuessResultCellClasses(val, answerVal, resultCell);
        }

        resultElement.appendChild(resultCell);
    }

    let guessResultsContainer = document.querySelector("#guess-results-container");
    guessResultsContainer.prepend(resultElement);
}

function getFormattedCellVal(val) {
    if(val instanceof Array) {
        return val.join(", ");
    }

    return val;
}

function addGuessResultCellClasses(val, answerVal, resultCell) {
    if(typeof val === "string") {
        if(val === answerVal) {
            resultCell.classList.add("correct");
        } else {
            resultCell.classList.add("incorrect");
        }
    } else if(val instanceof Array) {
        if(arraysAreSame(val, answerVal)) {
            resultCell.classList.add("correct");
        } else if(arraysHaveCommonElement(val, answerVal)) {
            resultCell.classList.add("partially-correct");
        } else {
            resultCell.classList.add("incorrect");
        }
    } else {
        console.error("Unsupported subelement type: ", typeof val);
    }
}

function handleAutocompleteSelection(event) {
    const newGuessInput = document.querySelector("#new-guess-input");
    newGuessInput.value = event.detail.selection.value;
}

function handleSubmitSelection() {
    const newGuessInput = document.querySelector("#new-guess-input");
    let selectedValue = newGuessInput.value;

    const selectedIndex = GUESS_DATA.findIndex(item => item.name.toLowerCase() === selectedValue.toLowerCase());
    if(selectedIndex === -1) {
        return;
    }

    // Close the autocomplete list
    autoCompleteJs.close();

    // Set the selection to the proper name in case the casing of the selection was different from the proper name
    selectedValue = GUESS_DATA[selectedIndex].name;

    newGuessInput.value = "";

    const answerIndex = getAnswerIdx();
    const isAnswer = selectedIndex === answerIndex;

    if(isAnswer) {
        setIsVictory();
        addVictoryTitle(selectedValue);
    }

    addUsedGuess(selectedValue);
    addGuessResultElement(selectedValue);
}

function addVictoryTitle() {
    const answerName = GUESS_DATA[getAnswerIdx()].name;

    let victoryTitle = document.createElement("span");
    victoryTitle.id = "victory-title";
    victoryTitle.innerHTML = "YOU DID IT! THE ANSWER IS: <span id='victory-answer-name'>".concat(answerName, "</span>");

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
    let usedGuesses = getUsedGuesses();
    if(usedGuesses === null)
        return list;

    return list.filter((item) => {
        return !usedGuesses.includes(item.value);
    });
}

function addUsedGuess(guess) {
    let usedGuesses = getUsedGuesses();

    if(usedGuesses === null) {
        usedGuesses = [guess];
    } else {
        usedGuesses.push(guess);
    }

    localStorage.setItem(LOCAL_STORAGE_USED_GUESSES_STRING, JSON.stringify(usedGuesses));
}

function clearUsedGuesses() {
    localStorage.removeItem(LOCAL_STORAGE_USED_GUESSES_STRING);
}

function getUsedGuesses() {
    return getLocalStorageObject(LOCAL_STORAGE_USED_GUESSES_STRING);
}

function setRandomAnswerIdx() {
    const answerIdx = Math.floor(Math.random() * GUESS_DATA.length)
    localStorage.setItem(LOCAL_STORAGE_ANSWER_IDX_STRING, JSON.stringify(answerIdx));
}

function getAnswerIdx() {
    return getLocalStorageObject(LOCAL_STORAGE_ANSWER_IDX_STRING);
}

function setIsVictory() {
    localStorage.setItem(LOCAL_STORAGE_VICTORY_STRING, JSON.stringify(true));
}

function clearIsVictory() {
    localStorage.removeItem(LOCAL_STORAGE_VICTORY_STRING);
}

function getIsVictory() {
    return getLocalStorageObject(LOCAL_STORAGE_VICTORY_STRING);
}

function getLocalStorageObject(key) {
    let retrievedValue = localStorage.getItem(key);
    if(retrievedValue === null)
        return null;

    return JSON.parse(retrievedValue);
}

function arraysHaveCommonElement(array1, array2) {
    for (let el1 of array1) {
        for (let el2 of array2) {
            if (el1 === el2) {
                return true;
            }
        }
    }

    return false;
}

function arraysAreSame(array1, array2) {
    return array1.sort().join(',')=== array2.sort().join(',');
}
