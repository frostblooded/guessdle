window.onload = function() {
    const newGuessInput = document.querySelector("#new-guess-input");

    const _autoCompleteJs = new autoComplete({
        selector: "#new-guess-input",
        placeHolder: "Search for Food...",
        data: {
            src: ["Cookie", "Ati", "Oreo", "Puhche", "Eddie", "Todorka", "Kiara", "Murlin"]
        },
        resultItem: {
            highlight: true,
        },
        events: {
            input: {
                selection: (event) => {
                    const selectedValue = event.detail.selection.value;
                    console.log(selectedValue);
                    newGuessInput.value = "";
                }
            }
        }
    });
}
