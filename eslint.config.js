import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  // shortcut: .mjs (server, hook) is plain JS outside tsc; lint it if it grows.
  { ignores: ["dist/", "node_modules/", "test-results/", "**/*.mjs"] },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
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
