import { expect, test, type Page } from "@playwright/test";

const stubLogin = (page: Page, admin: boolean): Promise<unknown> =>
  page.request.post("/api/test/login", {
    data: {
      email: `${admin ? "admin" : "player"}-${Date.now()}@example.test`,
      admin,
    },
  });

test("a non-admin has no panel and gets 403 from its endpoints", async ({
  page,
}) => {
  await stubLogin(page, false);
  await page.goto("/");
  await page.locator("#user-menu-button").click();
  await expect(page.locator("#admin-link")).toBeHidden();
  expect((await page.request.get("/api/admin/users")).status()).toBe(403);

  // The admin page itself says 403 and offers no panel
  await page.goto("/admin");
  await expect(page.locator("#gate-forbidden")).toBeVisible();
  await expect(page.locator("#gate-forbidden")).toContainText("403");
  await expect(page.locator("#admin-app")).toBeHidden();
});

test("a signed-out visitor is asked to sign in on the admin page", async ({
  page,
}) => {
  await page.goto("/admin");
  await expect(page.locator("#gate-signed-out")).toBeVisible();
  await expect(page.locator("#admin-app")).toBeHidden();
  await page.getByRole("link", { name: "Sign in", exact: true }).last().click();
  await expect(page).toHaveURL(/\/login$/);
});

test("an admin sees the Admin link in the account menu", async ({ page }) => {
  await stubLogin(page, true);
  await page.goto("/");
  await page.locator("#user-menu-button").click();
  await page.locator("#admin-link").click();
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.locator("#admin-app")).toBeVisible();
  await expect(page.locator("#admin-gate")).toBeHidden();
});

test("the admin tabs are a keyboard-operable tablist", async ({ page }) => {
  await stubLogin(page, true);
  await page.goto("/admin");
  // The tab handlers are wired once the sign-in check has finished
  await expect(page.locator("#admin-users tr").first()).toBeVisible();
  await expect(page.locator("#tab-answers")).toHaveCount(0);
  await page.locator("#tab-users").focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.locator("#tab-backup")).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(page.locator("#tab-backup")).toBeFocused();
  await expect(page.locator("#backup-panel")).toBeVisible();
  await expect(page.locator("#users-panel")).toBeHidden();
  await page.keyboard.press("ArrowLeft");
  await expect(page.locator("#users-panel")).toBeVisible();
});

test("an admin promotes and demotes a user; self-demotion is disabled and refused", async ({
  page,
  browser,
  baseURL,
}) => {
  const stamp = Date.now();
  const player = `target-${stamp}@example.test`;
  const me = `boss-${stamp}@example.test`;
  const playerPage = await browser.newPage({
    baseURL: baseURL!,
  });
  await playerPage.request.post("/api/test/login", { data: { email: player } });
  await page.request.post("/api/test/login", {
    data: { email: me, admin: true },
  });
  await page.goto("/admin");

  const row = (email: string): ReturnType<Page["locator"]> =>
    page.locator(`#admin-users tr[data-email="${email}"]`);
  await expect(row(player)).toContainText("player");
  await expect(row(me)).toContainText("admin");
  await expect(row(me).locator(".role-toggle")).toBeDisabled();
  await expect(row(me).locator(".user-delete")).toBeDisabled();

  // The server refuses self-demotion too
  const users = (await (await page.request.get("/api/admin/users")).json()) as {
    users: { id: number; email: string }[];
  };
  const myId = users.users.find((user) => user.email === me)!.id;
  const refused = await page.request.put(`/api/admin/users/${myId}`, {
    data: { admin: false },
  });
  expect(refused.status()).toBe(409);

  await row(player).locator(".role-toggle").click();
  await expect(row(player)).toContainText("admin");
  await expect(row(player).locator(".role-toggle")).toHaveText("DEMOTE");
  // Effective on the promoted user's next request
  expect((await playerPage.request.get("/api/admin/users")).status()).toBe(200);

  await row(player).locator(".role-toggle").click();
  await expect(row(player)).toContainText("player");
  expect((await playerPage.request.get("/api/admin/users")).status()).toBe(403);

  await playerPage.close();
});

test("an admin bans a player with a reason, the player sees it, and unban clears it", async ({
  page,
  browser,
  baseURL,
}) => {
  const stamp = Date.now();
  const player = `banned-${stamp}@example.test`;
  const playerPage = await browser.newPage({ baseURL: baseURL! });
  await playerPage.request.post("/api/test/login", { data: { email: player } });
  await page.request.post("/api/test/login", {
    data: { email: `banner-${stamp}@example.test`, admin: true },
  });
  await page.goto("/admin");
  const row = page.locator(`#admin-users tr[data-email="${player}"]`);
  await row.locator(".user-ban").click();
  await page.locator(".ban-reason").fill("Offensive game names");
  await page.locator(".ban-confirm").click();
  await expect(row.locator('[data-tag="banned"]')).toBeVisible();
  await expect(row.locator(".role-toggle")).toBeDisabled();

  await playerPage.goto("/create");
  await expect(playerPage.locator("#ban-notice")).toContainText(
    "Offensive game names",
  );
  await expect(playerPage.locator("#create-form")).toHaveCount(0);

  await row.locator(".user-unban").click();
  await expect(row.locator('[data-tag="banned"]')).toHaveCount(0);
  await playerPage.reload();
  await expect(playerPage.locator("#ban-notice")).toHaveCount(0);
  await playerPage.close();
});
