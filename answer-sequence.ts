// Pure Answer Sequence logic, see ADR 0002.
import { dateToString } from "./date.ts";

export const ANSWER_START_DATE: Date = new Date(2025, 7, 15);

// Fixed seed: every day's answer is part of one stable sequence (ADR 0002)
export function getAnswerSeed(): string {
  return dateToString(ANSWER_START_DATE);
}

function toUtcDay(date: Date): number {
  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
}

// Whole local calendar days from start to today. Built from calendar fields,
// so a DST change cannot shift it.
export function getDayNumber(start: Date, today: Date): number {
  return Math.round((toUtcDay(today) - toUtcDay(start)) / 86400000);
}

// Roster index of the Daily Answer for each of the `days` days from day 0.
// Each draw excludes the previous `skipPeriod` answers (clamped to roster size - 1).
export function generateAnswerSequence(
  rosterSize: number,
  skipPeriod: number,
  days: number,
  random: () => number,
): number[] {
  const answers: number[] = [];
  if (rosterSize < 1) return answers;

  const clampedSkipPeriod: number = Math.min(skipPeriod, rosterSize - 1);

  for (let day: number = 0; day < days; day++) {
    const forbiddenIdxs: number[] = answers.slice(
      Math.max(0, answers.length - clampedSkipPeriod),
    );
    const allowedIdxs: number[] = [];
    for (let idx: number = 0; idx < rosterSize; idx++) {
      if (!forbiddenIdxs.includes(idx)) allowedIdxs.push(idx);
    }

    answers.push(allowedIdxs[Math.floor(random() * allowedIdxs.length)]!);
  }

  return answers;
}
