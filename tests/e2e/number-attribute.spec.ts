import { expect, test } from "@playwright/test";
import { expectPlayDisabled, submitGuess } from "./helpers.ts";

let counter = 0;
const unique = (): string =>
  `${Date.now().toString(36)}${counter++}${Math.random().toString(36).slice(2, 6)}`;

test("a wrong number shows which way the answer is; a blank pauses the game", async ({
  page,
}) => {
  await page.request.post("/api/test/login", {
    data: { email: `number-${unique()}@example.test` },
  });
  const { slug } = (await (
    await page.request.post("/api/games", {
      data: { name: `Sizes ${unique()}` },
    })
  ).json()) as { slug: string };
  const [size] = (await (
    await page.request.put(`/api/games/${slug}/attributes`, {
      data: { attributes: [{ name: "Size", type: "number" }] },
    })
  ).json()) as { id: number }[];
  const sizes: Record<string, number> = { Small: 1, Medium: 5, Large: 9 };
  for (const [name, value] of Object.entries(sizes)) {
    const res = await page.request.post(`/api/games/${slug}/entries`, {
      data: { name, values: { [size!.id]: String(value) } },
    });
    expect(res.status()).toBe(200);
  }
  // The answer is random: grading every entry reveals it
  const ids = (
    (await (await page.request.get(`/api/games/${slug}`)).json()) as {
      entries: { id: number }[];
    }
  ).entries.map((e) => e.id);
  const { answer } = (await (
    await page.request.post(`/api/games/${slug}/grade`, { data: { ids } })
  ).json()) as { answer: string };
  const wrong = Object.keys(sizes).find((n) => n !== answer)!;

  await page.goto(`/g/${slug}`);
  await submitGuess(page, wrong);
  const cell = page.locator(".guess-result-row .cell").nth(1);
  await expect(cell).toHaveClass(/incorrect/);
  const hint = sizes[answer]! > sizes[wrong]! ? "higher" : "lower";
  await expect(cell.locator(`[data-hint="${hint}"]`)).toBeVisible();
  await expect(cell).toContainText(hint === "higher" ? "↑" : "↓");

  // A new column leaves every entry blank: the game pauses until they are filled
  await page.request.put(`/api/games/${slug}/attributes`, {
    data: {
      attributes: [
        { id: size!.id, name: "Size", type: "number" },
        { name: "Color", type: "text" },
      ],
    },
  });
  await page.reload();
  await expect(page.locator("#notice")).toContainText("paused");
  await expectPlayDisabled(page);
});
