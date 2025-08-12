window.onload = function() {
    new autoComplete({
        selector: "#new-guess-input",
        placeHolder: "Guess a cat...",
        data: {
            src: ["Cookie", "Ati", "Oreo", "Puhche", "Eddie", "Todorka", "Kiara", "Murlin"],
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
}

const LOCAL_STORAGE_USED_GUESSES_STRING = "usedGuesses";

function handleSelection(event) {
    const newGuessInput = document.querySelector("#new-guess-input");
    const selectedValue = event.detail.selection.value;
    newGuessInput.value = "";
    addUsedGuess(selectedValue);
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

function getUsedGuesses() {
    let retrievedValue = localStorage.getItem(LOCAL_STORAGE_USED_GUESSES_STRING);
    if(retrievedValue === null)
        return null;

    return JSON.parse(retrievedValue);
}
