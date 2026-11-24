import { expect, test } from "@playwright/test";

const unique = (): string =>
  `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

const importFile = {
  format: "guessdle-import/1",
  source: "https://en.wikipedia.org/wiki/List_of_Pixar_films",
  attributes: [
    { name: "Directed by", type: "list" },
    { name: "Running time", type: "number" },
  ],
  entries: [
    {
      name: "Toy Story",
      image: null,
      values: { "Directed by": ["John Lasseter"], "Running time": "81" },
    },
    {
      name: "Finding Nemo",
      image: null,
      values: { "Directed by": ["Andrew Stanton"], "Running time": "100" },
    },
  ],
};

test("the Entries tab imports a file from the Game Data Picker", async ({
  page,
}) => {
  await page.request.post("/api/test/login", {
    data: { email: `import-${unique()}@example.test` },
  });
  const created = await page.request.post("/api/games", {
    data: { name: `Import ${unique()}` },
  });
  const { slug } = (await created.json()) as { slug: string };
  await page.goto(`/g/${slug}/edit`);
  await expect(page.locator("#loading-state")).toBeHidden();
  await page.locator("#tab-entries").click();

  await page.getByRole("button", { name: "Import entries" }).click();
  await expect(page.locator("#import-dialog")).toBeVisible();
  await expect(page.locator("#import-submit")).toBeDisabled();
  await page.locator("#import-text").fill("{ not json");
  await expect(page.locator("#import-error")).toContainText(
    "not a Guessdle import file",
  );
  await page.locator("#import-text").fill(JSON.stringify(importFile));
  await expect(page.locator("#import-preview")).toContainText(
    "2 entries with Directed by (List), Running time (Number)",
  );
  await page.locator("#import-submit").click();

  await expect(page.locator("#import-dialog")).toBeHidden();
  await expect(page.locator("#import-notice")).toHaveText("Added 2 entries.");
  await expect(page.locator("#entry-list li")).toHaveCount(2);
  await expect(page.locator("#entry-list")).toContainText("Finding Nemo");

  await page.locator("#tab-attributes").click();
  await expect(page.getByLabel("Name of Running time")).toHaveValue(
    "Running time",
  );
});
