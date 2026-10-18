// Renders icons/favicon.svg into favicon.ico (16, 32, 48 px) and icons/apple-touch-icon.png (180 px).
// Run with `npm run icons` after editing the SVG, and commit the outputs.
import { chromium } from "@playwright/test";
import { readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const svg = await readFile(join(ROOT, "icons/favicon.svg"), "utf8");
const src = `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;

const browser = await chromium.launch();
const page = await browser.newPage();

// PNG of the icon at `size` px; `pad` px of `background` around it (the touch icon needs an opaque square)
async function render(size, { pad = 0, background = "transparent" } = {}) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(
    `<body style="margin:0;background:${background}"><img src="${src}" style="display:block;margin:${pad}px;width:${size - 2 * pad}px;height:${size - 2 * pad}px"></body>`,
  );
  await page.locator("img").evaluate((img) => img.decode());
  return page.screenshot({ omitBackground: background === "transparent" });
}

// ICO holding PNG images (supported by every current browser)
function ico(pngs) {
  const header = Buffer.alloc(6 + 16 * pngs.length);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(pngs.length, 4);
  let offset = header.length;
  pngs.forEach(({ size, data }, i) => {
    const entry = 6 + 16 * i;
    header.writeUInt8(size, entry);
    header.writeUInt8(size, entry + 1);
    header.writeUInt16LE(1, entry + 4);
    header.writeUInt16LE(32, entry + 6);
    header.writeUInt32LE(data.length, entry + 8);
    header.writeUInt32LE(offset, entry + 12);
    offset += data.length;
  });
  return Buffer.concat([header, ...pngs.map((png) => png.data)]);
}

const sizes = [16, 32, 48];
const pngs = [];
for (const size of sizes) pngs.push({ size, data: await render(size) });
await writeFile(join(ROOT, "favicon.ico"), ico(pngs));
await writeFile(
  join(ROOT, "icons/apple-touch-icon.png"),
  await render(180, { pad: 16, background: "#ffffff" }),
);
await browser.close();
