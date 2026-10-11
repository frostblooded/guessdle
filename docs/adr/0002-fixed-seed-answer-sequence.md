# The answer sequence uses a fixed seed derived from START_DATE

`generateAnswerIdx` replays every day from `START_DATE` to today, picking each day's Daily Answer uniformly from the roster minus the previous Skip Period answers. The RNG is seeded once, with `START_DATE`, before the replay. The seed is not today's date.

Previously the seed was today's date string. Every day then replayed a different random sequence, so the Skip Period only held inside one replay and never between two real consecutive days. The same pet could be the answer on back-to-back days, and some pets appeared noticeably more or less often than others. The old collision handling (`(idx + 1) % roster`) also favored the pet listed after any recently used one.

## Considered options

- Keep the daily seed: no change in answers, but the repeat problem stays.
- Shuffled bag (every pet once per cycle): perfectly even usage (22 or 23 appearances each over 423 days), but the order is predictable inside a cycle. Rejected for now in favor of a smaller change.
- Fixed seed plus uniform draw from the non-forbidden pets (chosen): the Skip Period holds across days and nothing is favored by array position. Counts still vary at random (16 to 27 per pet over 423 days).

## Consequences

- Changing `START_DATE`, the seed, the roster (order or length) or the Skip Period rewrites every Daily Answer, past and future. Adding or removing a pet has always done this; a future change could freeze past answers.
- On the day this shipped, every player's answer changed. Guesses and victory saved in `localStorage` for that day were graded against the old answer. No migration was done.
- The Skip Period is clamped to `roster size - 1`, so a tiny roster weakens the rule instead of failing.
- No automated test guards the sequence yet.
