const FILTER = new URLSearchParams(window.location.search).get("filter");

const LOCAL_STORAGE_USED_GUESSES_STRING = "usedGuesses_".concat(FILTER);
const LOCAL_STORAGE_VICTORY_STRING = "victory_".concat(FILTER);
const LOCAL_LAST_PLAYED_STRING = "lastPlayed_".concat(FILTER);

const UBISOFT_FILTER = "ubisoft";
const APOLLO_FILTER = "apollo";

const NO_FILTER_URL = ".";
const UBISOFT_FILTER_URL = "?filter=".concat(UBISOFT_FILTER);
const APOLLO_FILTER_URL = "?filter=".concat(APOLLO_FILTER);

// If an answer is chosen, it can't be chosen again for this amount of days
const ANSWER_SKIP_PERIOD = 5;

const ALL_GUESS_DATA = [
    {
        photo: "photos/ati.jpg",
        name: "Ati",
        colors: ["Black", "Orange", "White"],
        owners: ["Niki"],
        filters: [UBISOFT_FILTER, APOLLO_FILTER],
    },
    {
        photo: "photos/bela.jpg",
        name: "Bela",
        colors: ["Black", "Blue", "White"],
        owners: ["Beti"],
    },
    {
        photo: "photos/cookie.jpg",
        name: "Cookie",
        colors: ["Black", "Orange", "White"],
        owners: ["Niki"],
        filters: [UBISOFT_FILTER, APOLLO_FILTER],
    },
    {
        photo: "photos/dido.jpg",
        name: "Dido",
        colors: ["Blue", "White"],
        owners: ["Beti"],
    },
    {
        photo: "photos/eddie.jpg",
        name: "Eddie",
        colors: ["Orange", "White"],
        owners: ["Stefi", "Yasen"],
        filters: [APOLLO_FILTER],
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
        colors: ["Black", "Blue", "White"],
        owners: ["Beti"],
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
        colors: ["Black", "Orange", "White"],
        owners: ["Antonio", "Tanya"],
        filters: [APOLLO_FILTER],
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
        photo: "photos/patio.jpg",
        name: "Patio",
        colors: ["Black", "Green", "Yellow"],
        owners: ["Beti"],
    },
    {
        photo: "photos/pipi.jpg",
        name: "Pipi",
        colors: ["Blue", "White"],
        owners: ["Beti"],
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
            }
        }
    });

    Math.seedrandom(getCurrentDateString());
    initGame();
    loadInitialUsedGuessesElements();
    initButtons();
    initVictoryTitle();
    initNewGuessSubmit();
    setLastPlayed();
}

function initGame() {
    const lastPlayed = getLastPlayed();
    if(lastPlayed === null)
        return;

    const lastPlayedString = dateToString(lastPlayed);
    const todayString = dateToString(new Date());

    // If it's a new day, reset local storage
    if(lastPlayedString !== todayString) {
        clearIsVictory();
        clearUsedGuesses();
    }
}

function initNewGuessSubmit() {
    let newGuessInput = document.querySelector("#new-guess-input");

    newGuessInput.onkeydown = event => {
        // When enter is pressed
        if(event.keyCode === 13) {
            handleSubmitSelection();
        }
    };

    newGuessInput.addEventListener("open", _event => {
        // Hack to fix a bug on mobile where if you click on the autocomplete list item, the autocomplete list opens again immediately
        const isValidGuess = GUESS_DATA.findIndex(item => item.name === newGuessInput.value) !== -1;

        if(isValidGuess) {
            autoCompleteJs.close();
        }
    });
}

function initVictoryTitle() {
    if(getIsVictory()) {
        addVictoryTitle();
    }
}

let cachedAnswerIdx = null;

function getAnswerIdx() {
    if(cachedAnswerIdx === null) {
        const today = new Date();
        cachedAnswerIdx = generateAnswerIdx(today);
    }

    return cachedAnswerIdx;
}

function generateAnswerIdx() {
    const today = new Date();

    const START_DATE = new Date(2025, 7, 15);

    if(today < START_DATE) {
        console.log("Choose better start date");
        return generateRandomAnswerIdx();
    }

    let dateAnswers = [];
    let currentDate = START_DATE;
    let currentDateIdx = 0;

    while(currentDate <= today) {
        let forbiddenAnswerIdxs = [];

        for(let i = 1; i <= ANSWER_SKIP_PERIOD; i++) {
            if(currentDateIdx - i < 0)
                break;

            forbiddenAnswerIdxs.push(dateAnswers[currentDateIdx - i]);
        }

        let potentialIdx = generateRandomAnswerIdx();

        if(forbiddenAnswerIdxs.length > GUESS_DATA.length) {
            console.error("Too big answer skip period!");
            return potentialIdx;
        }

        while(forbiddenAnswerIdxs.includes(potentialIdx)) {
            potentialIdx = (potentialIdx + 1) % GUESS_DATA.length;
        }

        dateAnswers.push(potentialIdx);
        currentDateIdx++;
        currentDate.setDate(currentDate.getDate() + 1);
    }

    console.log(dateAnswers);
    return dateAnswers[dateAnswers.length - 1];
}

function generateRandomAnswerIdx() {
    return Math.floor(Math.random() * GUESS_DATA.length)
}

function initButtons() {
    let noFilterButton = document.querySelector("#no-filter-button");
    noFilterButton.onclick = () => { window.location.href = NO_FILTER_URL; };

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

function setIsVictory() {
    localStorage.setItem(LOCAL_STORAGE_VICTORY_STRING, JSON.stringify(true));
}

function clearIsVictory() {
    localStorage.removeItem(LOCAL_STORAGE_VICTORY_STRING);
}

function getIsVictory() {
    return getLocalStorageObject(LOCAL_STORAGE_VICTORY_STRING);
}

function setLastPlayed() {
    localStorage.setItem(LOCAL_LAST_PLAYED_STRING, JSON.stringify(getCurrentDateString()));
}

function getLastPlayed() {
    const lastPlayedString = getLocalStorageObject(LOCAL_LAST_PLAYED_STRING);
    return new Date(Date.parse(lastPlayedString));
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

function getCurrentDate() {
    return new Date();
}

function getCurrentDateString() {
    return dateToString(getCurrentDate());
}

function dateToString(date) {
    return 'Y-m-d'
        .replace('Y', date.getFullYear())
        .replace('m', date.getMonth() + 1)
        .replace('d', date.getDate());
}
