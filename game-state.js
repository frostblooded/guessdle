"use strict";
// Global script (no modules). Game State: what the browser remembers about today.
const LOCAL_STORAGE_USED_GUESSES_STRING = "usedGuesses";
const LOCAL_STORAGE_VICTORY_STRING = "victory";
const LOCAL_LAST_PLAYED_STRING = "lastPlayed";
// Corrupt JSON or a value of the wrong shape reads as missing
function readJson(storage, key) {
    const raw = storage.getItem(key);
    if (raw === null)
        return null;
    try {
        return JSON.parse(raw);
    }
    catch {
        return null;
    }
}
function createGameState(storage, now) {
    const getUsedGuesses = () => {
        const value = readJson(storage, LOCAL_STORAGE_USED_GUESSES_STRING);
        if (!Array.isArray(value))
            return [];
        return value.filter((item) => typeof item === "string");
    };
    return {
        getUsedGuesses,
        addUsedGuess(guess) {
            storage.setItem(LOCAL_STORAGE_USED_GUESSES_STRING, JSON.stringify([...getUsedGuesses(), guess]));
        },
        getIsVictory() {
            return readJson(storage, LOCAL_STORAGE_VICTORY_STRING) === true;
        },
        setIsVictory() {
            storage.setItem(LOCAL_STORAGE_VICTORY_STRING, JSON.stringify(true));
        },
        resetIfNewDay() {
            const lastPlayed = readJson(storage, LOCAL_LAST_PLAYED_STRING);
            if (lastPlayed === dateToString(now()))
                return;
            storage.removeItem(LOCAL_STORAGE_VICTORY_STRING);
            storage.removeItem(LOCAL_STORAGE_USED_GUESSES_STRING);
        },
        setLastPlayed() {
            storage.setItem(LOCAL_LAST_PLAYED_STRING, JSON.stringify(dateToString(now())));
        },
    };
}
