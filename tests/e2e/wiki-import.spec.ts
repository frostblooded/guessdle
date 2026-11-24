import { expect, test } from "@playwright/test";

const unique = (): string =>
  `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

const LIST = `<body><section><table class="wikitable">
  <tr><th>Film</th></tr>
  <tr><th scope="row"><a rel="mw:WikiLink" href="./Toy_Story">Toy Story</a></th></tr>
  <tr><th scope="row"><a rel="mw:WikiLink" href="./Finding_Nemo">Finding Nemo</a></th></tr>
  <tr><th scope="row"><a rel="mw:WikiLink" href="./Pixar_shorts">Pixar shorts</a></th></tr>
</table></section></body>`;

const film = (director: string, minutes: number): string =>
  `<body><table class="infobox">
  <tr><th class="infobox-label">Directed by</th><td class="infobox-data">${director}</td></tr>
  <tr><th class="infobox-label">Running time</th><td class="infobox-data">${minutes} minutes</td></tr>
</table></body>`;

const PAGES: Record<string, string> = {
  "page/html/List_of_Pixar_films": LIST,
  "page/html/Toy_Story": film("John Lasseter", 81),
  "page/html/Finding_Nemo": film("Andrew Stanton", 100),
  "page/html/Pixar_shorts": "<body><p>No infobox here.</p></body>",
};

test("Import from Wikipedia reads a list in the browser and imports the picked rows", async ({
  page,
}) => {
  await page.route("https://en.wikipedia.org/**", (route) => {
    const url = route.request().url();
    const body = Object.entries(PAGES).find(([path]) =>
      url.includes(path),
    )?.[1];
    return route.fulfill({
      status: body === undefined ? 404 : 200,
      contentType: "text/html",
      headers: { "Access-Control-Allow-Origin": "*" },
      body: body ?? "",
    });
  });
  await page.request.post("/api/test/login", {
    data: { email: `wiki-${unique()}@example.test` },
  });
  const created = await page.request.post("/api/games", {
    data: { name: `Wiki ${unique()}` },
  });
  const { slug } = (await created.json()) as { slug: string };
  await page.goto(`/g/${slug}/edit`);
  await page.locator("#tab-entries").click();
  await page.locator("#wiki-import-link").click();
  await expect(page).toHaveURL(new RegExp(`/g/${slug}/import$`));

  await page
    .locator("#wiki-list")
    .fill("https://en.wikipedia.org/wiki/List_of_Pixar_films");
  await page.locator("#wiki-read").click();
  await expect(page.locator("#wiki-progress-text")).toContainText(
    "3 of 3 pages read · 1 without an infobox (Pixar shorts)",
  );
  await expect(page.locator("#wiki-rows tbody tr")).toHaveCount(2);

  await page
    .getByRole("checkbox", { name: "Running time", exact: true })
    .check();
  await page.getByLabel("Type for Running time").selectOption("number");
  await page.locator("#wiki-tick-all").click();
  await expect(page.locator("#wiki-import")).toHaveText("Import 2 entries");
  await page.locator("#wiki-import").click();

  await expect(page).toHaveURL(new RegExp(`/g/${slug}/edit$`));
  await expect(page.locator("#import-notice")).toHaveText("Added 2 entries.");
  await expect(page.locator("#entry-list li")).toHaveCount(2);
  await expect(page.locator("#entry-list")).toContainText("Finding Nemo");
});
