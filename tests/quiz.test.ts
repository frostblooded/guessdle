import assert from "node:assert/strict";
import { describe, it } from "vitest";
import {
  gradeQuiz,
  isAnswerTo,
  parseQuizSpec,
  sameQuestion,
  scoreAnswer,
  spreadOf,
} from "../src/game/quiz.ts";

const choice = { options: ["Mars", "Jupiter"], correct: 1 };
const year = { answer: "1989", range: "10" };

describe("parseQuizSpec", () => {
  it("takes 2 to 6 distinct options with a right one, or a number with a range", () => {
    assert.deepEqual(
      parseQuizSpec({ options: [" Mars ", "Jupiter"], correct: 1 }),
      choice,
    );
    assert.deepEqual(parseQuizSpec({ answer: " 1989 ", range: "0,5" }), {
      answer: "1989",
      range: "0.5",
    });
    for (const bad of [
      { options: ["Mars"], correct: 0 },
      { options: ["A", "B", "C", "D", "E", "F", "G"], correct: 0 },
      { options: ["Mars", "mars"], correct: 0 },
      { options: ["Mars", ""], correct: 0 },
      { options: ["Mars", "Venus"], correct: 2 },
      { answer: "x", range: "1" },
      { answer: "1", range: "-1" },
      null,
    ]) {
      assert.equal(parseQuizSpec(bad), undefined, JSON.stringify(bad));
    }
  });
});

describe("scoreAnswer", () => {
  it("gives a choice all or nothing", () => {
    assert.equal(scoreAnswer(choice, "1"), 1);
    assert.equal(scoreAnswer(choice, "0"), 0);
    assert.equal(scoreAnswer(choice, 1), 0);
  });
  it("lowers a number's points in a line to 0 at the range", () => {
    assert.equal(scoreAnswer(year, "1989"), 1);
    assert.equal(scoreAnswer(year, "1986"), 0.7);
    assert.equal(scoreAnswer(year, "1999"), 0);
    assert.equal(scoreAnswer(year, "2050"), 0);
    assert.equal(scoreAnswer(year, "soon"), 0);
    // A range of 0 takes the exact answer only
    const exact = { answer: "3", range: "0" };
    assert.equal(scoreAnswer(exact, "3.0"), 1);
    assert.equal(scoreAnswer(exact, "3.1"), 0);
  });
  it("knows which answers a question takes", () => {
    assert.equal(isAnswerTo(choice, "1"), true);
    assert.equal(isAnswerTo(choice, "2"), false);
    assert.equal(isAnswerTo(year, "12,5"), true);
    assert.equal(isAnswerTo(year, ""), false);
  });
});

describe("gradeQuiz", () => {
  it("adds the points up, a blank or malformed answer scoring 0", () => {
    const questions = [
      { id: 1, name: "Largest?", photo: "", spec: choice },
      { id: 2, name: "Year?", photo: "", spec: year },
      { id: 3, name: "Again?", photo: "", spec: choice },
    ];
    const { score, review } = gradeQuiz(questions, {
      1: "1",
      2: "1991",
      3: "9",
    });
    assert.equal(score, 1.8);
    assert.deepEqual(
      review.map((r) => [r.yours, r.right, r.points]),
      [
        ["Jupiter", "Jupiter", 1],
        ["1991", "1989", 0.8],
        [null, "Jupiter", 0],
      ],
    );
  });
});

describe("spreadOf", () => {
  it("counts first scores per whole point, a full score in the last bar", () => {
    assert.deepEqual(spreadOf([0, 0.5, 1.9, 2, 3], 2), [2, 1, 2]);
  });
});

describe("sameQuestion", () => {
  it("lets only the right answer differ", () => {
    assert.ok(sameQuestion(choice, { ...choice, correct: 0 }));
    assert.ok(sameQuestion(year, { answer: "1990", range: "1" }));
    assert.ok(
      !sameQuestion(choice, { options: ["Mars", "Venus"], correct: 1 }),
    );
    assert.ok(!sameQuestion(choice, { options: ["Mars"], correct: 0 }));
    assert.ok(!sameQuestion(choice, year));
    assert.ok(!sameQuestion(year, choice));
  });
});
