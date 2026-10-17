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

test("an admin approves a pending game from its page; the owner gets no button", async ({
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
  const name = `Status ${id}`;
  const { slug } = (await (
    await owner.request.post("/api/games", { data: { name } })
  ).json()) as { slug: string };
  for (const entry of ["One", "Two"]) {
    await owner.request.post(`/api/games/${slug}/entries`, {
      data: { name: entry },
    });
  }

  // A draft: the owner sees it, without an Approve button
  await open(owner, slug);
  await expect(owner.locator("#status-notice")).toContainText("Draft");
  await expect(owner.locator("#approve-button")).toBeHidden();

  await owner.request.post(`/api/games/${slug}/submit`, { data: {} });

  // Anonymous players see the pending game but not its status
  await open(page, slug);
  await expect(page.locator("#status-notice")).toBeHidden();
  await expect(page.locator("#approve-button")).toBeHidden();

  await open(owner, slug);
  await expect(owner.locator("#status-notice")).toContainText("Pending");
  await expect(owner.locator("#approve-button")).toBeHidden();

  await open(admin, slug);
  await expect(admin.locator("#status-notice")).toContainText("Pending");
  await admin.locator("#approve-button").click();
  await expect(admin.locator("#status-notice")).toBeHidden();
  await expect(admin.locator("#approve-button")).toBeHidden();
  await expect(admin.locator("#approve-error")).toBeHidden();

  // Approved: off the queue, no notice and no button on reload
  const queue = (await (
    await admin.request.get("/api/admin/queue")
  ).json()) as {
    games: { slug: string }[];
  };
  expect(queue.games.map((g) => g.slug)).not.toContain(slug);
  await open(admin, slug);
  await expect(admin.locator("#status-notice")).toBeHidden();
  await expect(admin.locator("#approve-button")).toBeHidden();
});

test("an admin whose Approve lost a race sees why", async ({
  browser,
  baseURL,
}) => {
  const id = unique();
  const admin = await signedIn(
    browser,
    baseURL!,
    `admin-race-${id}@example.test`,
    true,
  );
  const { slug } = (await (
    await admin.request.post("/api/games", { data: { name: `Race ${id}` } })
  ).json()) as { slug: string };
  for (const entry of ["One", "Two"]) {
    await admin.request.post(`/api/games/${slug}/entries`, {
      data: { name: entry },
    });
  }
  await admin.request.post(`/api/games/${slug}/submit`, { data: {} });

  await open(admin, slug);
  // Another admin approves it first
  await admin.request.post(`/api/admin/games/${slug}/approve`, { data: {} });
  await admin.locator("#approve-button").click();
  await expect(admin.locator("#approve-error")).toContainText("status changed");
  await expect(admin.locator("#status-notice")).toContainText("Pending");
});
