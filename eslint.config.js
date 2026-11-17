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
