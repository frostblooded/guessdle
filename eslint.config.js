import eslint from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";
import storybook from "eslint-plugin-storybook";
import tseslint from "typescript-eslint";
import guessdle from "./eslint-rules/index.mjs";

export default tseslint.config(
  {
    ignores: [
      "dist/",
      "node_modules/",
      "test-results/",
      ".claude/worktrees/",
      // Third-party Claude Code hooks, kept as upstream ships them.
      ".claude/caveman/",
      ".claude/ponytail/",
      "storybook-static/",
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  { files: ["src/**/*.tsx"], ...reactHooks.configs.flat["recommended-latest"] },
  ...storybook.configs["flat/recommended"],
  // shortcut: no `globals` package; Node globals in .mjs would trip no-undef, so it is off there.
  { files: ["**/*.mjs"], rules: { "no-undef": "off" } },
  {
    files: ["src/**/*.ts", "src/**/*.tsx"],
    plugins: { guessdle },
    rules: {
      "guessdle/boundaries": "error",
      "max-lines": [
        "error",
        { max: 400, skipBlankLines: true, skipComments: true },
      ],
    },
  },
  // React effects and timers need nuance and breed bugs (stale closures, double runs, leaked
  // timers); browser code asks src/lib/effects.ts for a hook that names the job instead
  {
    files: ["src/**/*.ts", "src/**/*.tsx"],
    ignores: ["src/server/**", "src/lib/effects.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "react",
              importNames: [
                "useEffect",
                "useLayoutEffect",
                "useInsertionEffect",
              ],
              message:
                "Effects are banned outside src/lib/effects.ts. Use a hook from there (useOnce, useWhile, useOnOpen, useOutsideClick, useTicker, useDebounced, useDelayed, focusOnMount) or add a named one there with a test in tests/ui/effects.test.tsx. Often no effect is needed: do the work in the event handler.",
            },
          ],
        },
      ],
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "CallExpression[callee.name=/^(setTimeout|setInterval|clearTimeout|clearInterval|requestAnimationFrame|cancelAnimationFrame|requestIdleCallback|cancelIdleCallback)$/]",
          message:
            "Timers are banned outside src/lib/effects.ts: use useDebounced, useDelayed or useTicker in components, or schedule() outside React.",
        },
        {
          selector:
            "CallExpression[callee.object.name=/^(window|globalThis|self)$/][callee.property.name=/^(setTimeout|setInterval|requestAnimationFrame|requestIdleCallback)$/]",
          message:
            "Timers are banned outside src/lib/effects.ts: use useDebounced, useDelayed or useTicker in components, or schedule() outside React.",
        },
        {
          selector:
            "MemberExpression[object.name='React'][property.name=/^use(Layout|Insertion)?Effect$/]",
          message: "Effects are banned outside src/lib/effects.ts.",
        },
      ],
    },
  },
  // Browser code calls the API through src/game/transport.ts (fetch injected) or api() in src/manage-client.ts
  {
    files: ["src/**/*.ts", "src/**/*.tsx"],
    ignores: ["src/server/**", "src/lib/api.ts", "src/manage-client.ts"],
    rules: {
      "no-restricted-globals": [
        "error",
        {
          name: "fetch",
          message:
            "Call the API through api() in src/manage-client.ts, or take a Fetch parameter (src/game/transport.ts) and pass browserFetch from src/lib/api.ts, so status and error mapping stay in one place.",
        },
      ],
    },
  },
  {
    files: ["**/*.ts", "**/*.tsx"],
    rules: {
      curly: ["error", "all"],
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/typedef": [
        "error",
        {
          memberVariableDeclaration: true,
          parameter: true,
          propertyDeclaration: true,
        },
      ],
    },
  },
);
