import { expect, test, type Page } from "@playwright/test";
import { expectPlayDisabled } from "./helpers.ts";
import {
  mailTo,
  publishedMailpitUrl,
  tokenIn,
} from "../integration/mailpit.ts";

// 1x1 PNG
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

let counter = 0;
const unique = (): string =>
  `${Date.now().toString(36)}${counter++}${Math.random().toString(36).slice(2, 6)}`;

const stubLogin = (page: Page, admin = false): Promise<unknown> =>
  page.request.post("/api/test/login", {
    data: { email: `maker-${unique()}@example.test`, admin },
  });

// Creates a game through the form and lands in its editor
async function createViaForm(page: Page, name: string): Promise<string> {
  await page.goto("/create");
  await page.locator("#game-name").fill(name);
  await page.locator("#create-button").click();
  await expect(page).toHaveURL(/\/g\/[^/]+\/edit$/);
  await expect(page.locator("#loading-state")).toBeHidden();
  return new URL(page.url()).pathname.split("/")[2]!;
}

test("an anonymous visitor is sent to sign in and returns to Create", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Create a game" }).click();
  await expect(page).toHaveURL(/\/login\?next=%2Fcreate$/);
  const email = `back-${unique()}@example.test`;
  await page.locator("#login-email").fill(email);
  await page.locator("#login-button").click();
  await expect(page.locator("#login-sent")).toBeVisible();
  const mail = await mailTo(publishedMailpitUrl(), email);
  await page.goto(`/verify?token=${tokenIn(mail.Text)}`);
  await expect(page).toHaveURL(/\/create$/);
  await expect(page.locator("#create-form")).toBeVisible();
});

test("a plain sign-in still lands on the gallery", async ({ page }) => {
  await page.goto("/login?next=//evil.test");
  const email = `plain-${unique()}@example.test`;
  await page.locator("#login-email").fill(email);
  await page.locator("#login-button").click();
  await expect(page.locator("#login-sent")).toBeVisible();
  await page.goto(
    `/verify?token=${tokenIn((await mailTo(publishedMailpitUrl(), email)).Text)}`,
  );
  await expect(page).toHaveURL(/\/$/);
});

test("creating a game opens its editor as a draft, and Details saves", async ({
  page,
}) => {
  await stubLogin(page);
  const name = `Zoo ${unique()}`;
  await page.goto("/create");
  await page.locator("#game-name").fill(name);
  // The address follows the name until it is typed over
  await expect(page.locator("#game-slug")).toHaveValue(
    name.toLowerCase().replace(" ", "-"),
  );
  await page.locator("#create-button").click();
  await expect(page).toHaveURL(/\/g\/zoo-[^/]+\/edit$/);
  await expect(page.locator("#loading-state")).toBeHidden();

  await expect(page.locator("#status-notice")).toContainText("Draft");
  await expect(page.locator("#status-notice")).toContainText(
    "needs 2 more entries",
  );
  await expect(page.getByText("Web address")).toHaveCount(0);
  await expect(page.getByRole("tab", { name: "Details" })).toHaveAttribute(
    "aria-selected",
    "true",
  );

  await page.locator("#edit-name").fill(`${name} renamed`);
  await page.locator("#edit-description").fill("Animals of the zoo");
  await page.locator("#save-button").click();
  await expect(page.locator("#edit-saved")).toHaveText("Saved.");
  await page.reload();
  await expect(page.locator("#edit-name")).toHaveValue(`${name} renamed`);
  await expect(page.locator("#edit-description")).toHaveValue(
    "Animals of the zoo",
  );
  // The slug did not follow the rename
  expect(page.url()).toContain("/g/zoo-");
});

test("a typed address that is taken or reserved is refused with a message", async ({
  page,
}) => {
  await stubLogin(page);
  await page.goto("/create");
  await page.locator("#game-name").fill("Clash");
  await page.locator("#game-slug").fill("petdle");
  await page.locator("#create-button").click();
  await expect(page.locator("#create-error")).toContainText("already taken");
  await page.locator("#game-slug").fill("admin");
  await page.locator("#create-button").click();
  await expect(page.locator("#create-error")).toContainText("reserved");
  await expect(page).toHaveURL(/\/create$/);
});

test("a cover can be uploaded and removed, and a bad file is explained", async ({
  page,
}) => {
  await stubLogin(page);
  await createViaForm(page, `Cover ${unique()}`);
  await expect(page.locator("#cover-preview")).toBeHidden();
  await page
    .locator("#cover-file")
    .setInputFiles({ name: "a.png", mimeType: "image/png", buffer: PNG });
  await expect(page.locator("#cover-preview")).toBeVisible();
  await expect(page.locator("#cover-preview")).toHaveAttribute(
    "src",
    /^\/uploads\/[0-9a-f]{32}\.webp$/,
  );
  await page.locator("#cover-file").setInputFiles({
    name: "a.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("no"),
  });
  await expect(page.locator("#edit-error")).toContainText("JPEG, PNG or WebP");
  await page.locator("#cover-remove").click();
  await expect(page.locator("#cover-preview")).toBeHidden();
});

test("only the owner and admins open the editor; a draft is a 404 to others", async ({
  browser,
  page,
}) => {
  await stubLogin(page);
  const slug = await createViaForm(page, `Private ${unique()}`);

  const stranger = await (await browser.newContext()).newPage();
  await stubLogin(stranger);
  await stranger.goto(`/g/${slug}/edit`);
  await expect(stranger.locator("#edit-blocked")).toBeVisible();
  await expect(stranger.locator("#editor")).toBeHidden();
  await stranger.goto(`/g/${slug}`);
  await expect(stranger.locator("#not-found")).toBeVisible();

  const admin = await (await browser.newContext()).newPage();
  await stubLogin(admin, true);
  await admin.goto(`/g/${slug}/edit`);
  await expect(admin.locator("#editor")).toBeVisible();

  // Signed out: asked to sign in, and back here afterwards
  const anon = await (await browser.newContext()).newPage();
  await anon.goto(`/g/${slug}/edit`);
  await expect(anon).toHaveURL(/\/login\?next=/);
  await Promise.all(
    [stranger.context(), admin.context(), anon.context()].map((c) => c.close()),
  );
});

test("My games lists the games a user created with their status", async ({
  page,
}) => {
  await stubLogin(page);
  await page.goto("/my-games");
  await expect(page.locator("#mine-empty")).toBeVisible();
  const slug = await createViaForm(page, `Mine ${unique()}`);
  await page.goto("/my-games");
  const row = page.locator(".mine-row");
  await expect(row).toHaveCount(1);
  await expect(row.locator(".badge")).toHaveText("draft");
  await row.getByRole("link", { name: "Edit" }).click();
  await expect(page).toHaveURL(new RegExp(`/g/${slug}/edit$`));
});

test("Create and My games are one click from the account menu", async ({
  page,
}) => {
  await stubLogin(page);
  await page.goto("/");
  await page.locator("#user-menu-button").click();
  await page.getByRole("link", { name: "My games" }).click();
  await expect(page).toHaveURL(/\/my-games$/);
});

test("the owner of an empty draft sees why it cannot be played, not a connection error", async ({
  page,
}) => {
  await stubLogin(page);
  const slug = await createViaForm(page, "Empty draft");
  await page.goto(`/g/${slug}`);
  await expect(page.locator("#loading-state")).toBeHidden();
  await expect(page.locator("#notice")).toContainText(
    "needs at least 2 entries",
  );
  await expect(page.locator("#notice")).not.toContainText("connection");
  await expect(page.locator("#edit-link")).toBeVisible();
  await expectPlayDisabled(page);
});
