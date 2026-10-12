import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist/", "node_modules/", "test-results/"] },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  // shortcut: no `globals` package; Node globals in .mjs would trip no-undef, so it is off there.
  { files: ["**/*.mjs"], rules: { "no-undef": "off" } },
  {
    files: ["**/*.ts"],
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
