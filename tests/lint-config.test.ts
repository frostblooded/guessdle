import assert from "node:assert/strict";
import { ESLint } from "eslint";
import { join } from "node:path";
import { describe, it } from "vitest";

const eslint: ESLint = new ESLint({ cwd: join(import.meta.dirname, "..") });
const problems = async (file: string, code: string): Promise<string[]> => {
  const [result] = await eslint.lintText(code, { filePath: file });
  return (result?.messages ?? []).map((m) => m.ruleId ?? m.message);
};

describe("eslint.config.js bans", () => {
  it("useEffect and useLayoutEffect in components", async () => {
    assert.deepEqual(
      await problems(
        "src/routes/x-page.tsx",
        `import { useEffect, useLayoutEffect } from "react";\nexport const a = [useEffect, useLayoutEffect];\n`,
      ),
      ["no-restricted-imports", "no-restricted-imports"],
    );
  });

  it("timers in browser code, called bare or on window", async () => {
    assert.deepEqual(
      await problems(
        "src/party-socket.ts",
        `setTimeout(() => undefined, 1);\nwindow.setInterval(() => undefined, 1);\nrequestAnimationFrame(() => undefined);\n`,
      ),
      ["no-restricted-syntax", "no-restricted-syntax", "no-restricted-syntax"],
    );
  });

  it("but allows them in src/lib/effects.ts and on the server", async () => {
    const code = `import { useEffect } from "react";\nexport const a = useEffect;\nsetTimeout(() => undefined, 1);\n`;
    assert.deepEqual(await problems("src/lib/effects.ts", code), []);
    assert.deepEqual(
      await problems("src/server/x.ts", `setTimeout(() => undefined, 1);\n`),
      [],
    );
  });

  it("the global fetch in browser code outside the API helpers", async () => {
    assert.deepEqual(
      await problems("src/routes/x-page.tsx", `void fetch("/api/me");\n`),
      ["no-restricted-globals"],
    );
    assert.deepEqual(
      await problems("src/lib/api.ts", `void fetch("/api/me");\n`),
      [],
    );
  });
});
