import assert from "node:assert/strict";
import fc from "fast-check";
import { describe, it } from "vitest";
import {
  blurProgress,
  CELLS,
  cellRect,
  isBlurOrder,
  outOfTries,
  toggleCell,
} from "../src/game/blur.ts";
import { clampRect, cropOutputSize } from "../src/game/crop.ts";
import { dateOfDay } from "../src/game/date.ts";
import { statusOf } from "../src/game/days.ts";
import { MAX_SLUG, MIN_SLUG } from "../src/game/limits.ts";
import {
  gradeQuiz,
  isAnswerTo,
  parseQuizSpec,
  scoreAnswer,
  spreadOf,
  type QuizSpec,
} from "../src/game/quiz.ts";
import {
  RESERVED_SLUGS,
  slugBase,
  slugError,
  slugify,
} from "../src/game/slug.ts";
import {
  formatSeconds,
  MAX_GUESS_BAR,
  summarize,
  TIME_BUCKETS,
  timeBucket,
} from "../src/game/stats.ts";

describe("slug properties", () => {
  it("slugBase of any name is a valid slug shape and slugify is idempotent", () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 80 }), (name) => {
        const base = slugBase(name);
        assert.notEqual(slugError(base), "invalid", `"${name}" -> "${base}"`);
        assert.equal(slugify(slugify(name)), slugify(name));
      }),
    );
  });

  it("slugError accepts exactly the lowercase, digit and dash slugs in range that are not reserved", () => {
    fc.assert(
      fc.property(fc.stringMatching(/^[a-z0-9-]{0,45}$/), (slug) => {
        const expected =
          slug.length < MIN_SLUG || slug.length > MAX_SLUG
            ? "invalid"
            : RESERVED_SLUGS.includes(slug)
              ? "reserved"
              : null;
        assert.equal(slugError(slug), expected);
      }),
    );
  });
});

describe("date properties", () => {
  it("consecutive Day Numbers are consecutive calendar days", () => {
    fc.assert(
      fc.property(
        fc.date({
          min: new Date("2000-01-01T00:00:00Z"),
          max: new Date("2090-01-01T00:00:00Z"),
          noInvalidDate: true,
        }),
        fc.integer({ min: 0, max: 20_000 }),
        (start, day) => {
          const s = start.toISOString().slice(0, 10);
          assert.equal(dateOfDay(0, s), s);
          const a = Date.parse(`${dateOfDay(day, s)}T00:00:00Z`);
          const b = Date.parse(`${dateOfDay(day + 1, s)}T00:00:00Z`);
          assert.equal(b - a, 86_400_000);
        },
      ),
    );
  });
});

describe("Blur properties", () => {
  it("clicking cells in any order ends in a complete order after CELLS - 1 new cells", () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 0, max: CELLS - 1 }), { maxLength: 40 }),
        (clicks) => {
          let order: number[] = [];
          for (const cell of clicks) {
            order = toggleCell(order, cell);
            assert.equal(new Set(order).size, order.length, "no repeats");
            assert.ok(order.every((c) => c >= 0 && c < CELLS));
          }
          assert.equal(isBlurOrder(order), order.length === CELLS);
        },
      ),
    );
  });

  it("toggling an unfinished order's cell twice gives it back", () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(fc.integer({ min: 0, max: CELLS - 1 }), {
          maxLength: CELLS - 2,
        }),
        fc.integer({ min: 0, max: CELLS - 1 }),
        (order, cell) => {
          fc.pre(!order.includes(cell) && order.length < CELLS - 2);
          assert.deepEqual(toggleCell(toggleCell(order, cell), cell), order);
        },
      ),
    );
  });

  it("a Blur Board shows 1..tries squares, never more tries left than tries, and loses exactly when out of tries", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 20 }),
        fc.integer({ min: 1, max: 9 }),
        fc.boolean(),
        (wrong, tries, finished) => {
          const p = blurProgress(wrong, tries, finished);
          assert.ok(p.shown >= 1 && p.shown <= tries);
          assert.ok(p.left >= 0 && p.left <= tries);
          assert.equal(p.lost, outOfTries(tries, wrong, false));
          if (finished || p.lost) {
            assert.equal(p.shown, tries);
          }
        },
      ),
    );
  });

  it("the nine cells tile the image exactly, without gaps or overlaps", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 4000 }),
        fc.integer({ min: 1, max: 4000 }),
        (width, height) => {
          let area = 0;
          for (let cell = 0; cell < CELLS; cell++) {
            const r = cellRect(cell, width, height);
            assert.ok(r.left >= 0 && r.top >= 0);
            assert.ok(r.left + r.width <= width && r.top + r.height <= height);
            area += r.width * r.height;
          }
          assert.equal(area, width * height);
        },
      ),
    );
  });
});

describe("Past day status properties", () => {
  it("a win beats a give-up beats used-up tries beats guesses", () => {
    fc.assert(
      fc.property(
        fc.boolean(),
        fc.boolean(),
        fc.integer({ min: 0, max: 12 }),
        fc.option(fc.integer({ min: 1, max: 9 })),
        (won, gaveUp, guesses, tries) => {
          const status = statusOf({ won, gaveUp, guesses }, tries);
          const expected = won
            ? "won"
            : gaveUp
              ? "gave-up"
              : tries !== null && guesses >= tries
                ? "lost"
                : guesses > 0
                  ? "playing"
                  : "unplayed";
          assert.equal(status, expected);
        },
      ),
    );
  });
});

const choiceSpec: fc.Arbitrary<QuizSpec> = fc
  .uniqueArray(fc.stringMatching(/^[a-z]{1,8}$/), {
    minLength: 2,
    maxLength: 6,
  })
  .chain((options) =>
    fc
      .integer({ min: 0, max: options.length - 1 })
      .map((correct) => ({ options, correct })),
  );
const numberSpec: fc.Arbitrary<QuizSpec> = fc
  .tuple(
    fc.integer({ min: -1000, max: 1000 }),
    fc.integer({ min: 0, max: 500 }),
  )
  .map(([answer, range]) => ({ answer: String(answer), range: String(range) }));
const spec: fc.Arbitrary<QuizSpec> = fc.oneof(choiceSpec, numberSpec);

describe("Quiz properties", () => {
  it("a saved spec parses back to itself", () => {
    fc.assert(
      fc.property(spec, (s) => {
        assert.deepEqual(parseQuizSpec(s), s);
      }),
    );
  });

  it("scores are 0..1 in hundredths, and the right answer scores 1", () => {
    fc.assert(
      fc.property(
        spec,
        fc.oneof(fc.string(), fc.integer().map(String)),
        (s, answer) => {
          const points = scoreAnswer(s, answer);
          assert.ok(points >= 0 && points <= 1);
          assert.ok(Math.abs(points * 100 - Math.round(points * 100)) < 1e-9);
          const right = "options" in s ? String(s.correct) : s.answer;
          assert.equal(scoreAnswer(s, right), 1);
        },
      ),
    );
  });

  it("a number answer never scores more the further it is from the answer", () => {
    fc.assert(
      fc.property(
        numberSpec,
        fc.integer({ min: 0, max: 600 }),
        fc.integer({ min: 0, max: 600 }),
        (s, d1, d2) => {
          fc.pre("answer" in s);
          const at = (d: number): number =>
            scoreAnswer(
              s,
              String(Number((s as { answer: string }).answer) + d),
            );
          const [near, far] = d1 <= d2 ? [d1, d2] : [d2, d1];
          assert.ok(at(near) >= at(far));
        },
      ),
    );
  });

  it("an answer the question does not take scores 0 in the graded quiz", () => {
    fc.assert(
      fc.property(spec, fc.string(), (s, answer) => {
        const { score } = gradeQuiz(
          [{ id: 1, name: "q", photo: "", spec: s }],
          { "1": answer },
        );
        if (!isAnswerTo(s, answer)) {
          assert.equal(score, 0);
        } else {
          assert.equal(score, scoreAnswer(s, answer));
        }
      }),
    );
  });

  it("the spread counts every score exactly once", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 20 }),
        fc.array(fc.double({ min: -1, max: 25, noNaN: true })),
        (total, scores) => {
          const bars = spreadOf(scores, total);
          assert.equal(bars.length, total + 1);
          assert.equal(
            bars.reduce((a, b) => a + b, 0),
            scores.length,
          );
        },
      ),
    );
  });
});

const win = fc.record({
  guesses: fc.integer({ min: 1, max: 40 }),
  seconds: fc.option(fc.integer({ min: 0, max: 24 * 3600 })),
});

describe("victory stats properties", () => {
  it("every winner lands in one guess bar and timed winners in one time bucket", () => {
    fc.assert(
      fc.property(fc.array(win, { maxLength: 30 }), (results) => {
        const stats = summarize(3, results, null);
        assert.equal(stats.players, results.length);
        assert.equal(stats.guesses.length, MAX_GUESS_BAR);
        assert.equal(
          stats.guesses.reduce((a, b) => a + b, 0),
          results.length,
        );
        assert.equal(
          stats.times.reduce((a, b) => a + b, 0),
          results.filter((r) => r.seconds !== null).length,
        );
      }),
    );
  });

  it("the shares compare against the others only and stay within 0..100", () => {
    fc.assert(
      fc.property(
        fc.array(win, { minLength: 1, maxLength: 30 }),
        fc.nat(),
        (results, pick) => {
          const you = results[pick % results.length]!;
          const stats = summarize(0, results, you);
          if (results.length === 1) {
            assert.equal(stats.fewerGuessesThan, null);
          }
          for (const share of [stats.fewerGuessesThan, stats.fasterThan]) {
            assert.ok(share === null || (share >= 0 && share <= 100));
          }
        },
      ),
    );
  });

  it("every time has a bucket, and formatSeconds never shows more than 59 in a unit", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 10 * 24 * 3600 }), (seconds) => {
        const bucket = timeBucket(seconds);
        assert.ok(bucket >= 0 && bucket < TIME_BUCKETS.length);
        assert.ok(seconds < TIME_BUCKETS[bucket]!.upTo);
        const text = formatSeconds(seconds);
        assert.match(text, /^(\d+s|\d+m [0-5]\ds|\d+h [0-5]\dm)$/);
      }),
    );
  });
});

describe("crop properties", () => {
  it("a clamped frame lies inside the image at the asked aspect", () => {
    fc.assert(
      fc.property(
        fc.record({
          x: fc.double({ min: -2000, max: 4000, noNaN: true }),
          y: fc.double({ min: -2000, max: 4000, noNaN: true }),
          width: fc.double({ min: 1, max: 5000, noNaN: true }),
        }),
        fc.record({
          width: fc.integer({ min: 1, max: 4000 }),
          height: fc.integer({ min: 1, max: 4000 }),
        }),
        fc.constantFrom(1, 16 / 9, 3 / 4),
        (frame, bounds, aspect) => {
          const r = clampRect(
            { ...frame, height: frame.width / aspect },
            bounds,
            aspect,
          );
          const eps = 1e-6;
          assert.ok(r.x >= -eps && r.y >= -eps);
          assert.ok(r.x + r.width <= bounds.width + eps);
          assert.ok(r.y + r.height <= bounds.height + eps);
          assert.ok(Math.abs(r.width / r.height - aspect) < 1e-6);
        },
      ),
    );
  });

  it("the cropped file is never enlarged and its longer side fits the limit", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 8000 }),
        fc.constantFrom(1, 16 / 9, 3 / 4),
        fc.integer({ min: 64, max: 2048 }),
        (cropWidth, aspect, maxSide) => {
          const out = cropOutputSize(cropWidth, aspect, maxSide);
          assert.ok(out.width >= 1 && out.height >= 1);
          assert.ok(out.width <= Math.max(1, Math.round(cropWidth)));
          assert.ok(Math.max(out.width, out.height) <= maxSide + 1);
        },
      ),
    );
  });
});
