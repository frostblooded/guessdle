import { expect, test, type Page } from "@playwright/test";
import sharp, { type Sharp } from "sharp";

// Cropping uploads to their in-game shape before they are sent (issue #82)

let counter = 0;
const unique = (): string =>
  `${Date.now().toString(36)}${counter++}${Math.random().toString(36).slice(2, 6)}`;

// A wide PNG: left half red, right half blue
const wide = (): Promise<Buffer> =>
  sharp({
    create: { width: 600, height: 300, channels: 3, background: "#ff0000" },
  })
    .composite([
      {
        input: {
          create: {
            width: 300,
            height: 300,
            channels: 3,
            background: "#0000ff",
          },
        },
        left: 300,
        top: 0,
      },
    ])
    .png()
    .toBuffer();

// Signs in, makes a game with a Photo Image attribute and opens its editor; counts the uploads
// the page sends
async function openEditor(page: Page): Promise<{ uploads: () => number }> {
  await page.request.post("/api/test/login", {
    data: { email: `crop-${unique()}@example.test` },
  });
  const created = await page.request.post("/api/games", {
    data: { name: `Crop ${unique()}` },
  });
  const { slug } = (await created.json()) as { slug: string };
  await page.request.post(`/api/games/${slug}/attributes`, {
    data: { name: "Photo", type: "image" },
  });
  let sent = 0;
  page.on("request", (r) => {
    if (r.url().includes("/api/uploads")) {
      sent++;
    }
  });
  await page.goto(`/g/${slug}/edit`);
  await expect(page.locator("#loading-state")).toBeHidden();
  return { uploads: () => sent };
}

const pickPhoto = async (page: Page, buffer: Buffer): Promise<void> => {
  await page.locator("#tab-entries").click();
  await page
    .locator("#entry-fields input[type=file]")
    .setInputFiles({ name: "pet.png", mimeType: "image/png", buffer });
};

// The stored upload's pixels
async function stored(page: Page, selector: string): Promise<Sharp> {
  const src = await page.locator(selector).getAttribute("src");
  const res = await page.request.get(src!);
  return sharp(await res.body());
}

test("confirming uploads the photo cropped square from the middle", async ({
  page,
}) => {
  await openEditor(page);
  await pickPhoto(page, await wide());
  await expect(page.locator("#crop-dialog")).toBeVisible();
  await page.locator("#crop-confirm").click();
  await expect(page.locator("#crop-dialog")).toHaveCount(0);
  await expect(page.locator(".entry-image-preview")).toBeVisible();
  const meta = await (await stored(page, ".entry-image-preview")).metadata();
  expect([meta.width, meta.height]).toEqual([300, 300]);
});

test("moving and zooming the frame changes what is uploaded", async ({
  page,
}) => {
  await openEditor(page);
  await pickPhoto(page, await wide());
  await page.locator("#crop-zoom-in").click();
  // Drag the frame as far left as it goes: only the red half is left in it
  const box = (await page.locator("cropper-selection").boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x - 600, box.y + box.height / 2, { steps: 10 });
  await page.mouse.up();
  await page.locator("#crop-confirm").click();
  await expect(page.locator(".entry-image-preview")).toBeVisible();
  const image = await stored(page, ".entry-image-preview");
  const { width, height } = await image.metadata();
  expect(width).toBe(height);
  expect(width).toBeLessThan(300);
  const { data, info } = await image
    .raw()
    .toBuffer({ resolveWithObject: true });
  // The top-right pixel is red, not blue
  const at = (info.width - 1) * info.channels;
  expect(data[at]).toBeGreaterThan(200);
  expect(data[at + 2]).toBeLessThan(50);
});

test("cancelling the crop uploads nothing", async ({ page }) => {
  const { uploads } = await openEditor(page);
  await pickPhoto(page, await wide());
  await page.locator("#crop-cancel").click();
  await expect(page.locator("#crop-dialog")).toHaveCount(0);
  await expect(page.locator(".entry-image-preview")).toBeHidden();
  await expect(page.locator("#entry-error")).toHaveText("");
  expect(uploads()).toBe(0);
});

test("a file the browser cannot decode is explained and not uploaded", async ({
  page,
}) => {
  const { uploads } = await openEditor(page);
  await pickPhoto(page, Buffer.from("not really a png"));
  await expect(page.locator("#entry-error")).toContainText(
    "cannot open that file as an image",
  );
  await expect(page.locator("#crop-dialog")).toHaveCount(0);
  expect(uploads()).toBe(0);
});

test("a cover is cropped to the gallery banner's 16:7", async ({ page }) => {
  await openEditor(page);
  await page.locator("#cover-file").setInputFiles({
    name: "cover.png",
    mimeType: "image/png",
    buffer: await sharp({
      create: { width: 800, height: 800, channels: 3, background: "#00aa00" },
    })
      .png()
      .toBuffer(),
  });
  await expect(page.locator("#crop-title")).toHaveText("Crop the cover");
  await page.locator("#crop-confirm").click();
  await expect(page.locator("#cover-preview")).toBeVisible();
  const meta = await (await stored(page, "#cover-preview")).metadata();
  expect([meta.width, meta.height]).toEqual([800, 350]);
});
