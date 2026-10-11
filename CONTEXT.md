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

**Answer Sequence**:
The series of Daily Answers from the game's start date onward. It is the same for every player and never depends on when it is computed.

**Skip Period**:
The number of most recent daily answers that cannot be chosen again, including across consecutive days. Currently 5.

**Attribute**:
A compared property of a pet, such as colors or owners. A guess is graded per attribute as correct, partially correct, or incorrect.
