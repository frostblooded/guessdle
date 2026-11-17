import { RuleTester } from "eslint";
import { join } from "node:path";
import { describe, it } from "vitest";
import guessdle from "../eslint-rules/index.mjs";

RuleTester.describe = describe;
RuleTester.it = it;

const root: string = join(import.meta.dirname, "..");
const at = (file: string): string => join(root, file);
const rule = (name: string) => {
  const found = guessdle.rules[name];
  if (found === undefined) {
    throw new Error(`no rule ${name}`);
  }
  return found;
};
const tester: RuleTester = new RuleTester({
  languageOptions: { ecmaVersion: 2024, sourceType: "module" },
});

tester.run("boundaries", rule("boundaries"), {
  valid: [
    {
      filename: at("src/game/play.ts"),
      code: `import { a } from "./date.ts";`,
    },
    {
      filename: at("src/server/routes/game.ts"),
      code: `import { b } from "../../game/board.ts"; import express from "express"; import { c } from "../auth.ts";`,
    },
    {
      filename: at("src/routes/play/play-page.tsx"),
      code: `import { b } from "../../game/board.ts"; import { useQuery } from "@tanstack/react-query"; import pic from "../../../howto/ati.jpg";`,
    },
    {
      filename: at("tests/anything.test.ts"),
      code: `import { x } from "../src/server/auth.ts"; import pg from "pg";`,
    },
  ],
  invalid: [
    {
      filename: at("src/game/play.ts"),
      code: `import { useState } from "react";`,
      errors: [{ messageId: "game" }],
    },
    {
      filename: at("src/game/play.ts"),
      code: `import { x } from "../lib/api.ts";`,
      errors: [{ messageId: "game" }],
    },
    {
      filename: at("src/game/play.ts"),
      code: `export { x } from "../server/auth.ts";`,
      errors: [{ messageId: "game" }],
    },
    {
      filename: at("src/server/mailer.ts"),
      code: `import { x } from "../mail-settings.ts";`,
      errors: [{ messageId: "server" }],
    },
    {
      filename: at("src/server/routes/admin.ts"),
      code: `const m = await import("../../lib/api.ts");`,
      errors: [{ messageId: "server" }],
    },
    {
      filename: at("src/routes/admin/admin-page.tsx"),
      code: `import { x } from "../../server/auth.ts";`,
      errors: [{ messageId: "clientServer" }],
    },
    {
      filename: at("src/account.ts"),
      code: `import { randomUUID } from "node:crypto"; import pg from "pg";`,
      errors: [{ messageId: "clientPackage" }, { messageId: "clientPackage" }],
    },
  ],
});

tester.run("no-comments", rule("no-comments"), {
  valid: [
    {
      filename: at("src/server/rate-limit.ts"),
      code: `// shortcut: in memory until the API scales out\nconst a = 1;\n// eslint-disable-next-line no-control-regex\nconst b = /\\x00/;\n/// <reference types="vite/client" />\n// @ts-expect-error untyped\nconst c = a + b;\n`,
    },
    {
      filename: at("src/game/play.ts"),
      code: `const url = "https://example.test/a//b"; const re = /\\/\\//;`,
    },
  ],
  invalid: [
    {
      filename: at("src/game/play.ts"),
      code: `// what this does\nconst a = 1;\n`,
      output: `const a = 1;\n`,
      errors: [{ messageId: "comment" }],
    },
    {
      filename: at("src/game/play.ts"),
      code: `const a = 1; // why\nconst b = 2;\n`,
      output: `const a = 1;\nconst b = 2;\n`,
      errors: [{ messageId: "comment" }],
    },
    {
      filename: at("src/game/play.ts"),
      code: `/**\n * Docs\n */\nexport const a = 1;\n`,
      output: `export const a = 1;\n`,
      errors: [{ messageId: "comment" }],
    },
    {
      filename: at("src/components/x.tsx"),
      code: `const el = (\n  <div>\n    {/* note */}\n    <span />\n  </div>\n);\n`,
      output: `const el = (\n  <div>\n    <span />\n  </div>\n);\n`,
      languageOptions: {
        parserOptions: { ecmaFeatures: { jsx: true } },
      },
      errors: [{ messageId: "comment" }],
    },
  ],
});
