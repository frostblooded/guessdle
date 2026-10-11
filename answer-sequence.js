"use strict";
// Global script (no modules). Pure Answer Sequence logic, see ADR 0002.
const ANSWER_START_DATE = new Date(2025, 7, 15);
function dateToString(date) {
    return "Y-m-d"
        .replace("Y", String(date.getFullYear()))
        .replace("m", String(date.getMonth() + 1))
        .replace("d", String(date.getDate()));
}
// Fixed seed: every day's answer is part of one stable sequence (ADR 0002)
function getAnswerSeed() {
    return dateToString(ANSWER_START_DATE);
}
function toUtcDay(date) {
    return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
}
// Whole local calendar days from start to today. Built from calendar fields,
// so a DST change cannot shift it.
function getDayNumber(start, today) {
    return Math.round((toUtcDay(today) - toUtcDay(start)) / 86400000);
}
// Roster index of the Daily Answer for each of the `days` days from day 0.
// Each draw excludes the previous `skipPeriod` answers (clamped to roster size - 1).
function generateAnswerSequence(rosterSize, skipPeriod, days, random) {
    const answers = [];
    if (rosterSize < 1)
        return answers;
    const clampedSkipPeriod = Math.min(skipPeriod, rosterSize - 1);
    for (let day = 0; day < days; day++) {
        const forbiddenIdxs = answers.slice(Math.max(0, answers.length - clampedSkipPeriod));
        const allowedIdxs = [];
        for (let idx = 0; idx < rosterSize; idx++) {
            if (!forbiddenIdxs.includes(idx))
                allowedIdxs.push(idx);
        }
        answers.push(allowedIdxs[Math.floor(random() * allowedIdxs.length)]);
    }
    return answers;
}
