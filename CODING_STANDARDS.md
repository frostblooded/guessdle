# Coding standards

Read during review. Judgement calls only; tooling covers the rest (`npm run lint` enforces braces and explicit types on function parameters, class members and properties only; variables, arrow parameters and destructuring are left to inference).

## Braces

Always brace `if`/`else`/loop bodies, including guard clauses (an early return for an error or missing precondition). Prettier does not add braces, so write them:

```ts
if (usedGuesses === null) {
  return list;
}
```

## Indentation

2 spaces.
