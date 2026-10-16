# Petdle

A daily guessing game. Players guess which pet of the day it is by comparing attributes.

## Language

**Pet**:
One entry in the roster: a photo, a name, and its attributes.

**Roster**:
The fixed list of all pets the game can choose from.

**Guess**:
A pet the player submits as their attempt at the daily answer.

**Daily Answer**:
The one pet chosen for a given calendar date. Every player gets the same daily answer on the same date.

**Answer History**:
The stored Daily Answers from the game's start date onward, one per calendar date in the server time zone. Past days never change.

**Skip Period**:
The number of most recent daily answers that cannot be chosen again, including across consecutive days. Currently 5.

**Attribute**:
A compared property of a pet, such as colors or owners. A guess is graded per attribute as correct, partially correct, or incorrect.

**Correctness**:
How well one attribute of a guess matches the Daily Answer: correct, partially correct, or incorrect. Partially correct applies only to attributes holding several values that share at least one.

**Game State**:
What the player's browser remembers about today: the Guesses made, whether they gave up, and the day last played. It resets on a new calendar day, or when the player resets after a win or give-up.

**Day Number**:
Whole calendar days since the game's start date. The start date itself is day 0. Each Day Number maps to exactly one Daily Answer.
