"use strict";
// Global script (no modules). Pure grading of a guessed attribute.
var Correctness;
(function (Correctness) {
    Correctness[Correctness["Incorrect"] = 0] = "Incorrect";
    Correctness[Correctness["PartiallyCorrect"] = 1] = "PartiallyCorrect";
    Correctness[Correctness["Correct"] = 2] = "Correct";
})(Correctness || (Correctness = {}));
const CORRECTNESS_CLASSES = {
    [Correctness.Incorrect]: "incorrect",
    [Correctness.PartiallyCorrect]: "partially-correct",
    [Correctness.Correct]: "correct",
};
function correctnessClass(correctness) {
    return CORRECTNESS_CLASSES[correctness];
}
function gradeCorrectness(guess, answer) {
    if (typeof guess === "string")
        return guess === answer ? Correctness.Correct : Correctness.Incorrect;
    if (arraysAreSame(guess, answer))
        return Correctness.Correct;
    if (arraysHaveCommonElement(guess, answer))
        return Correctness.PartiallyCorrect;
    return Correctness.Incorrect;
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
    // Assumes neither array contains duplicate values (true for the roster).
    // With duplicates, the result is not meaningful: ["a", "a", "b"] and
    // ["a", "b", "b"] would compare as the same.
    if (array1.length !== array2.length)
        return false;
    return array1.every((el) => array2.includes(el));
}
