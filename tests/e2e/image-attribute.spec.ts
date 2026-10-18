import { expect, test } from "@playwright/test";
import sharp from "sharp";
import { submitGuess } from "./helpers.ts";

let counter = 0;
const unique = (): string =>
  `${Date.now().toString(36)}${counter++}${Math.random().toString(36).slice(2, 6)}`;

test("an Image column shows each guess's picture uncolored, and a blank one does not pause", async ({
  page,
}) => {
  await page.request.post("/api/test/login", {
    data: { email: `image-${unique()}@example.test` },
  });
  const { slug } = (await (
    await page.request.post("/api/games", {
      data: { name: `Pictures ${unique()}` },
    })
  ).json()) as { slug: string };
  const [owner, side] = (await (
    await page.request.put(`/api/games/${slug}/attributes`, {
      data: {
        attributes: [
          { name: "Owner", type: "text" },
          { name: "Side", type: "image" },
        ],
      },
    })
  ).json()) as { id: number }[];
  const up = await page.request.post("/api/uploads?kind=photo", {
    headers: { "Content-Type": "application/octet-stream" },
    data: await sharp({
      create: { width: 40, height: 40, channels: 3, background: "#c00" },
    })
      .png()
      .toBuffer(),
  });
  const { url } = (await up.json()) as { url: string };
  for (const [name, picture] of [
    ["Pictured", url],
    ["Plain", ""],
  ] as const) {
    const res = await page.request.post(`/api/games/${slug}/entries`, {
      data: { name, values: { [owner!.id]: "Niki", [side!.id]: picture } },
    });
    expect(res.status()).toBe(200);
  }

  await page.goto(`/g/${slug}`);
  await expect(page.locator(".guess-result-title")).toHaveText([
    "Name",
    "Owner",
    "Side",
  ]);
  await submitGuess(page, "Pictured");
  const cells = page.locator(".guess-result-row").first().locator(".cell");
  await expect(cells).toHaveCount(3);
  await expect(cells.nth(2).locator("img")).toHaveAttribute("src", url);
  await expect(cells.nth(2)).not.toHaveClass(/correct/);
  await expect(page.locator("#notice")).not.toContainText("paused");
});
