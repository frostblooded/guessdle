# Coding standards

Read during review. Judgement calls only; tooling covers the rest.

## Early return

A guard clause returns early because of an error or a missing precondition the function needs. Write it as `if (...)`, then `return` on the next line, no braces:

```ts
if (usedGuesses === null)
  return list;
```

A return that is part of the function's normal logic (a found-match return inside a search loop, the result of a branch) is not a guard clause. Keep braces there.

## Indentation

2 spaces.
