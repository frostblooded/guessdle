import eslint from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";
import storybook from "eslint-plugin-storybook";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "dist/",
      "node_modules/",
      "test-results/",
      ".claude/worktrees/",
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
    rules: {
      "max-lines": [
        "error",
        { max: 400, skipBlankLines: true, skipComments: true },
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
