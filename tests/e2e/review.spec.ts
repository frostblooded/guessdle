import { expect, test, type Browser, type Page } from "@playwright/test";

let counter = 0;
const unique = (): string =>
  `${Date.now().toString(36)}${counter++}${Math.random().toString(36).slice(2, 6)}`;

// A fresh browser context signed in as an admin
async function admin(browser: Browser, baseURL: string): Promise<Page> {
  const page = await (await browser.newContext({ baseURL })).newPage();
  await page.request.post("/api/test/login", {
    data: { email: `reviewer-${unique()}@example.test`, admin: true },
  });
  return page;
}

// A pending two-entry game owned by `page`'s user
async function pendingGame(page: Page, name: string): Promise<string> {
  const { slug } = (await (
    await page.request.post("/api/games", { data: { name } })
  ).json()) as { slug: string };
  for (const entry of ["One", "Two"]) {
    await page.request.post(`/api/games/${slug}/entries`, {
      data: { name: entry },
    });
  }
  await page.request.post(`/api/games/${slug}/submit`, { data: {} });
  return slug;
}

const statusOf = async (page: Page, slug: string): Promise<string> =>
  (
    (await (await page.request.get(`/api/games/${slug}/details`)).json()) as {
      status: string;
    }
  ).status;

test("an admin approves or rejects with a reason from the editor", async ({
  browser,
  baseURL,
}) => {
  const page = await admin(browser, baseURL!);
  const approveMe = await pendingGame(page, `Edit approve ${unique()}`);
  const rejectMe = await pendingGame(page, `Edit reject ${unique()}`);

  await page.goto(`/g/${approveMe}/edit`);
  await expect(page.locator("#loading-state")).toBeHidden();
  await page.locator("#approve-button").click();
  await expect(page.locator("#unpublish-button")).toBeVisible();
  await expect(page.locator("#approve-button")).toBeHidden();
  await expect(page.locator("#reject-button")).toBeHidden();
  expect(await statusOf(page, approveMe)).toBe("approved");

  await page.goto(`/g/${rejectMe}/edit`);
  await expect(page.locator("#loading-state")).toBeHidden();
  await page.locator("#reject-button").click();
  const confirm = page.getByRole("button", { name: "Reject game" });
  await expect(confirm).toBeDisabled();
  await page.getByLabel("Reason").fill("Needs more entries");
  await confirm.click();
  await expect(page.locator("#status-notice")).toContainText(
    "Needs more entries",
  );
  await expect(page.locator("#reject-button")).toBeHidden();
  expect(await statusOf(page, rejectMe)).toBe("rejected");
});

test("an admin rejects from the Play page", async ({ browser, baseURL }) => {
  const page = await admin(browser, baseURL!);
  const slug = await pendingGame(page, `Play reject ${unique()}`);
  await page.goto(`/g/${slug}`);
  await page.locator("#reject-button").click();
  await page.getByLabel("Reason").fill("Duplicate game");
  await page.getByRole("button", { name: "Reject game" }).click();
  await expect(page.locator("#status-notice")).toContainText("Duplicate game");
  await expect(page.locator("#approve-button")).toBeHidden();
  expect(await statusOf(page, slug)).toBe("rejected");
});

test("All games filters by status and reviews pending games", async ({
  browser,
  baseURL,
}) => {
  const page = await admin(browser, baseURL!);
  const id = unique();
  const pending = await pendingGame(page, `Listed ${id} a`);
  const rejectMe = await pendingGame(page, `Listed ${id} b`);
  const { slug: draft } = (await (
    await page.request.post("/api/games", { data: { name: `Listed ${id} c` } })
  ).json()) as { slug: string };

  await page.goto("/admin");
  await page.locator("#tab-games").click();
  await page.getByPlaceholder("Search by name, address or owner").fill(id);
  const row = (slug: string) =>
    page.locator(`#all-games tr[data-slug="${slug}"]`);
  await expect(row(draft)).toBeVisible();
  // Only pending games can be reviewed
  await expect(row(draft).getByRole("button", { name: "Approve" })).toHaveCount(
    0,
  );

  await page.getByLabel("Status").selectOption("pending");
  await expect(row(draft)).toBeHidden();
  await expect(row(pending)).toBeVisible();

  await row(pending).getByRole("button", { name: "Approve" }).click();
  await expect(row(pending)).toBeHidden();
  await row(rejectMe).getByRole("button", { name: "Reject" }).click();
  await page.getByLabel("Reason").fill("Off topic");
  await page.getByRole("button", { name: "Reject game" }).click();
  await expect(row(rejectMe)).toBeHidden();

  await page.getByLabel("Status").selectOption("");
  await expect(row(pending).getByText("approved")).toBeVisible();
  await expect(row(rejectMe).getByText("rejected")).toBeVisible();
  expect(await statusOf(page, rejectMe)).toBe("rejected");
});
