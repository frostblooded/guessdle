# Unit tests load the compiled global scripts in node:vm

Petdle's front-end is plain global scripts (no ES modules, no bundler). The pure logic lives in `answer-sequence`, `correctness` and `game-state`. Unit tests compile with `tsc`, then load each compiled `.js` into an isolated `node:vm` context (`tests/helpers/load-game.ts`) with `random` and `Storage` injected. The tests read the globals the script defines, exactly as the browser would. Playwright e2e tests cover the DOM flow against the real server.

## Considered options

- ES modules: importable by the test runner, but needs `type="module"` loading or a bundler, and changes the deployed layout only to serve tests.
- jsdom: runs scripts as a browser would, but adds a heavy dependency and still needs a DOM for logic that has none. The DOM flow is covered by Playwright instead.
- vm context (chosen): no change to the shipped scripts, no extra dependency, and injected dependencies keep tests deterministic.

## Consequences

- Scripts under test must stay free of DOM access and take their dependencies as arguments.
- Tests run against compiled output, so `npm test` runs `tsc` first.
- Changing the roster, seed, start date or Skip Period fails the golden fixture on purpose (ADR 0002). Regenerate the fixture only deliberately.
- Do not "fix" the layout into ES modules without replacing this seam.
