import { expect, test } from "@playwright/test";

let counter = 0;
const unique = (): string =>
  `${Date.now().toString(36)}${counter++}${Math.random().toString(36).slice(2, 6)}`;

test("the Attributes tab keeps edits until Save, which warns before erasing values", async ({
  page,
}) => {
  await page.request.post("/api/test/login", {
    data: { email: `attr-${unique()}@example.test` },
  });
  const created = await page.request.post("/api/games", {
    data: { name: `Attr ${unique()}` },
  });
  const { slug } = (await created.json()) as { slug: string };
  await page.goto(`/g/${slug}/edit`);
  await expect(page.locator("#loading-state")).toBeHidden();

  await page.locator("#tab-attributes").click();
  await expect(page.locator("#panel-attributes")).toBeVisible();
  await expect(page.locator("#details-form")).toBeHidden();

  await expect(page.locator("#attr-save")).toBeDisabled();
  await page.locator("#attr-name").fill("Color");
  await page.locator("#attr-type").selectOption("list");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByLabel("Name of Color")).toHaveValue("Color");
  await expect(page.getByLabel("Type of Color")).toHaveValue("list");
  await expect(page.locator("#attr-name")).toHaveValue("");
  await expect(page.locator("#attr-unsaved")).toBeVisible();

  // A clash is refused with a readable error and the list stays as it was
  await page.locator("#attr-name").fill("color");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.locator("#attr-error")).toContainText(
    "already has that name",
  );
  await expect(page.locator("#attr-list li")).toHaveCount(1);

  // Nothing is saved until Save: a reload loses the unsaved column
  await page.reload();
  await expect(page.locator("#loading-state")).toBeHidden();
  await page.locator("#tab-attributes").click();
  await expect(page.locator("#attr-list li")).toHaveCount(0);

  await page.locator("#attr-name").fill("Color");
  await page.locator("#attr-type").selectOption("list");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await page.locator("#attr-save").click();
  await expect(page.locator("#attr-unsaved")).toBeHidden();
  await expect(page.locator("#attr-save")).toBeDisabled();

  // A rename alone erases nothing, so no warning
  await page.getByLabel("Name of Color").fill("Hue");
  await page.locator("#attr-save").click();
  await expect(page.locator("#attr-unsaved")).toBeHidden();

  // A type change asks first; dismissing keeps it unsaved
  await page.getByLabel("Type of Hue").selectOption("number");
  let warning = "";
  page.once("dialog", (dialog) => {
    warning = dialog.message();
    void dialog.dismiss();
  });
  await page.locator("#attr-save").click();
  await expect.poll(() => warning).toContain('"Hue"');
  await expect(page.locator("#attr-unsaved")).toBeVisible();
  page.once("dialog", (dialog) => void dialog.accept());
  await page.locator("#attr-save").click();
  await expect(page.locator("#attr-unsaved")).toBeHidden();

  // It survives a reload
  await page.reload();
  await expect(page.locator("#loading-state")).toBeHidden();
  await page.locator("#tab-attributes").click();
  await expect(page.getByLabel("Type of Hue")).toHaveValue("number");

  // Visible at rest, without hover: a real border, like the other buttons
  const removeButton = page.getByRole("button", { name: "Remove Hue" });
  await expect(removeButton).toBeVisible();
  await expect(removeButton).not.toHaveCSS(
    "border-top-color",
    "rgba(0, 0, 0, 0)",
  );

  await removeButton.click();
  await expect(page.locator("#attr-list li")).toHaveCount(0);
  await page.locator("#attr-discard").click();
  await expect(page.locator("#attr-list li")).toHaveCount(1);
  await removeButton.click();
  page.once("dialog", (dialog) => void dialog.accept());
  await page.locator("#attr-save").click();
  await expect(page.locator("#attr-unsaved")).toBeHidden();
  await expect(page.locator("#attr-list li")).toHaveCount(0);
});

test("a slow attribute load neither shows the editor early nor overwrites typing", async ({
  page,
}) => {
  await page.request.post("/api/test/login", {
    data: { email: `slow-${unique()}@example.test` },
  });
  const created = await page.request.post("/api/games", {
    data: { name: `Slow ${unique()}` },
  });
  const { slug } = (await created.json()) as { slug: string };
  await page.route(`**/api/games/${slug}/attributes`, async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 600));
    await route.continue();
  });
  await page.goto(`/g/${slug}/edit`);
  await expect(page.locator("#editor")).toBeHidden();
  await expect(page.locator("#loading-state")).toBeHidden();
  await page.locator("#edit-name").fill("Typed name");
  await page.locator("#tab-attributes").click();
  await page.locator("#attr-name").fill("Color");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByLabel("Name of Color")).toBeVisible();
  await page.locator("#attr-save").click();
  await expect(page.locator("#attr-unsaved")).toBeHidden();
  await page.locator("#tab-details").click();
  await expect(page.locator("#edit-name")).toHaveValue("Typed name");
});
