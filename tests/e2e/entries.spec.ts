import { expect, test } from "@playwright/test";

let counter = 0;
const unique = (): string =>
  `${Date.now().toString(36)}${counter++}${Math.random().toString(36).slice(2, 6)}`;

// A 1x1 PNG
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

test("the Entries tab adds, edits and deletes entries and counts what is missing", async ({
  page,
}) => {
  await page.request.post("/api/test/login", {
    data: { email: `entries-${unique()}@example.test` },
  });
  const created = await page.request.post("/api/games", {
    data: { name: `Entries ${unique()}` },
  });
  const { slug } = (await created.json()) as { slug: string };
  await page.request.post(`/api/games/${slug}/attributes`, {
    data: { name: "Color", type: "list" },
  });
  await page.goto(`/g/${slug}/edit`);
  await expect(page.locator("#loading-state")).toBeHidden();
  await expect(page.locator("#status-notice")).toContainText(
    "needs 2 more entries",
  );

  await page.locator("#tab-entries").click();
  await expect(page.locator("#panel-entries")).toBeVisible();
  await expect(page.locator("#details-form")).toBeHidden();

  await page.locator("#entry-name").fill("Rex");
  await page.locator("#entry-photo").setInputFiles({
    name: "rex.png",
    mimeType: "image/png",
    buffer: PNG,
  });
  await expect(page.locator("#entry-photo-preview")).toBeVisible();
  await page.getByLabel("Color (one per line)").fill("Red\nBlue");
  await page.getByRole("button", { name: "Add entry" }).click();
  await expect(page.locator("#entry-list li")).toHaveCount(1);
  await expect(page.locator("#entry-list img")).toBeVisible();
  await expect(page.locator("#status-notice")).toContainText(
    "needs 1 more entry",
  );

  // A name clash is refused with a readable error
  await page.locator("#entry-name").fill("rex");
  await page.getByRole("button", { name: "Add entry" }).click();
  await expect(page.locator("#entry-error")).toContainText(
    "already has that name",
  );
  await page.locator("#entry-name").fill("Fido");
  await page.getByRole("button", { name: "Add entry" }).click();
  await expect(page.locator("#entry-list li")).toHaveCount(2);
  await expect(page.locator("#status-notice")).not.toContainText("needs");

  // Editing loads the saved values back into the form
  await page.getByRole("button", { name: "Edit Rex" }).click();
  await expect(page.getByLabel("Color (one per line)")).toHaveValue(
    "Red\nBlue",
  );
  await page.locator("#entry-name").fill("Rexy");
  await page.getByRole("button", { name: "Save entry" }).click();
  await expect(page.locator("#entry-list")).toContainText("Rexy");

  // It survives a reload
  await page.reload();
  await expect(page.locator("#loading-state")).toBeHidden();
  await page.locator("#tab-entries").click();
  await expect(page.locator("#entry-list li")).toHaveCount(2);

  page.once("dialog", (dialog) => void dialog.accept());
  await page.getByRole("button", { name: "Delete Fido" }).click();
  await expect(page.locator("#entry-list li")).toHaveCount(1);
  await expect(page.locator("#status-notice")).toContainText(
    "needs 1 more entry",
  );
});
