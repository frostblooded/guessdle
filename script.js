const LOCAL_STORAGE_USED_GUESSES_STRING = "usedGuesses";
const LOCAL_STORAGE_ANSWER_IDX_STRING = "answerIdX";

const UBISOFT_FILTER = "ubisoft";
const APOLLO_FILTER = "apollo";

const UBISOFT_FILTER_URL = "/?filter=".concat(UBISOFT_FILTER);
const APOLLO_FILTER_URL = "/?filter=".concat(APOLLO_FILTER);

const ALL_GUESS_DATA = [
    {
        name: "Ati",
        colors: ["Black", "White", "Orange"],
        owners: ["Niki"],
        filters: [UBISOFT_FILTER, APOLLO_FILTER],
    },
    {
        name: "Cookie",
        colors: ["Black", "White", "Orange"],
        owners: ["Niki"],
        filters: [UBISOFT_FILTER, APOLLO_FILTER],
    },
    {
        name: "Eddie",
        colors: ["Orange"],
        owners: ["Stefi", "Yasen"],
        filters: [APOLLO_FILTER],
    },
    {
        name: "Jaro",
        colors: ["Black"],
        owners: ["Ico"],
        filters: [APOLLO_FILTER],
    },
    {
        name: "Jeffy",
        colors: ["Black"],
        owners: ["Ico"],
        filters: [APOLLO_FILTER],
    },
    {
        name: "Kiara",
        colors: ["Black", "White", "Orange"],
        owners: ["Antonio", "Tanya"],
        filters: [APOLLO_FILTER],
    },
    {
        name: "Kimi",
        colors: ["Black", "White", "Orange"],
        owners: ["Bori"],
    },
    {
        name: "Mochi",
        colors: ["Orange", "White"],
        owners: ["Petya"],
        filters: [UBISOFT_FILTER],
    },
    {
        name: "Murlin",
        colors: ["Black"],
        owners: ["Antonio", "Tanya"],
        filters: [APOLLO_FILTER],
    },
    {
        name: "Oreo",
        colors: ["Black", "White"],
        owners: ["Cveti", "Vili"],
        filters: [UBISOFT_FILTER],
    },
    {
        name: "Puhche",
        colors: ["Black", "White"],
        owners: ["Cveti", "Vili"],
        filters: [UBISOFT_FILTER],
    },
    {
        name: "Todorka",
        colors: ["Black", "White"],
        owners: ["Didi"],
        filters: [APOLLO_FILTER],
    },
];

const GUESS_DATA = (() => {
    const filter = getCurrentFilter();
    if(filter === null)
        return ALL_GUESS_DATA;

    return ALL_GUESS_DATA.filter((item) => {
        if(!Object.hasOwn(item, "filters"))
            return false;

        return item.filters.includes(filter);
    });
})();

const GUESS_DATA_NAMES = GUESS_DATA.map(item => item.name);

window.onload = function() {
    new autoComplete({
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
                selection: handleSelection,
            }
        }
    });

    loadInitialUsedGuessesElements();
    initButtons();
    initAnswerIdx();
}

function getCurrentFilter() {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get("filter");
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

    const filter = getCurrentFilter();

    let noFilterButton = document.querySelector("#no-filter-button");
    noFilterButton.onclick = () => { window.location.href = "/"; };

    if(filter === null) {
        noFilterButton.classList.add("active");
    }

    let ubisoftFilterButton = document.querySelector("#ubisoft-filter-button");
    ubisoftFilterButton.onclick = () => { window.location.href = UBISOFT_FILTER_URL; };

    if(filter === UBISOFT_FILTER) {
        ubisoftFilterButton.classList.add("active");
    }

    let apolloFilterButton = document.querySelector("#apollo-filter-button");
    apolloFilterButton.onclick = () => { window.location.href = APOLLO_FILTER_URL; };

    if(filter === APOLLO_FILTER) {
        apolloFilterButton.classList.add("active");
    }
}

function onResetButtonClick() {
    setRandomAnswerIdx();
    clearUsedGuesses();

    let guessResultRows = document.querySelectorAll(".guess-result-row");

    for (let row of guessResultRows) {
        row.remove();
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
        const answerVal = answerData[key];

        let resultCell = document.createElement("div");
        resultCell.setAttribute("class", "guess-result-cell cell");

        resultCell.textContent = formattedVal;
        addGuessResultCellClasses(val, answerVal, resultCell);
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

function handleSelection(event) {
    const newGuessInput = document.querySelector("#new-guess-input");
    const selectedValue = event.detail.selection.value;
    newGuessInput.value = "";
    addUsedGuess(selectedValue);
    addGuessResultElement(selectedValue);
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

    console.log("Answer chosen to be ", GUESS_DATA[answerIdx]);
}

function getAnswerIdx() {
    return getLocalStorageObject(LOCAL_STORAGE_ANSWER_IDX_STRING);
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
