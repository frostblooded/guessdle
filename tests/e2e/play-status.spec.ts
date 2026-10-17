import { expect, test, type Browser, type Page } from "@playwright/test";

let counter = 0;
const unique = (): string =>
  `${Date.now().toString(36)}${counter++}${Math.random().toString(36).slice(2, 6)}`;

// A fresh browser context signed in as `email`
async function signedIn(
  browser: Browser,
  baseURL: string,
  email: string,
  admin: boolean = false,
): Promise<Page> {
  const page = await (await browser.newContext({ baseURL })).newPage();
  await page.request.post("/api/test/login", { data: { email, admin } });
  return page;
}

// Opens the game's Play page and waits for it to load
async function open(page: Page, slug: string): Promise<void> {
  await page.goto(`/g/${slug}`);
  await expect(page.locator("#loading-state")).toBeHidden();
}

test("only the owner and admins see the game's status on its page", async ({
  page,
  browser,
  baseURL,
}) => {
  const id = unique();
  const owner = await signedIn(browser, baseURL!, `owner-${id}@example.test`);
  const admin = await signedIn(
    browser,
    baseURL!,
    `admin-${id}@example.test`,
    true,
  );
  const other = await signedIn(browser, baseURL!, `other-${id}@example.test`);
  const { slug } = (await (
    await owner.request.post("/api/games", { data: { name: `Status ${id}` } })
  ).json()) as { slug: string };
  for (const entry of ["One", "Two"]) {
    await owner.request.post(`/api/games/${slug}/entries`, {
      data: { name: entry },
    });
  }

  await open(owner, slug);
  await expect(owner.locator("#status-notice")).toContainText("Draft");

  await owner.request.post(`/api/games/${slug}/submit`, { data: {} });
  for (const viewer of [owner, admin]) {
    await open(viewer, slug);
    await expect(viewer.locator("#status-notice")).toContainText("Pending");
  }
  // Other players can play a pending game but are not told its status
  for (const viewer of [page, other]) {
    await open(viewer, slug);
    await expect(viewer.locator("#status-notice")).toBeHidden();
  }

  await admin.request.post(`/api/admin/games/${slug}/reject`, {
    data: { reason: "Too vague" },
  });
  await open(owner, slug);
  await expect(owner.locator("#status-notice")).toContainText(
    "Rejected: Too vague",
  );

  // Approved games show no notice, as in the editor
  await owner.request.post(`/api/games/${slug}/submit`, { data: {} });
  await admin.request.post(`/api/admin/games/${slug}/approve`, { data: {} });
  await open(owner, slug);
  await expect(owner.locator("#status-notice")).toBeHidden();
});
