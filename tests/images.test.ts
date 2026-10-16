import assert from "node:assert/strict";
import { describe, it } from "node:test";
import sharp from "sharp";
import {
  ImageError,
  MAX_UPLOAD_BYTES,
  processImage,
} from "../src/server/images.ts";

const make = (
  format: "jpeg" | "png" | "webp" | "gif",
  width = 2000,
  height = 1000,
): Promise<Buffer> => {
  const img = sharp({
    create: { width, height, channels: 3, background: "#c0392b" },
  });
  return img[format]().toBuffer();
};

const rejects = (buf: Buffer, code: string): Promise<void> =>
  assert.rejects(
    processImage(buf, "photo"),
    (err) => err instanceof ImageError && err.code === code,
  );

describe("processImage", () => {
  for (const format of ["jpeg", "png", "webp"] as const) {
    it(`re-encodes ${format} to WebP`, async () => {
      const out = await processImage(await make(format, 100, 50), "photo");
      assert.equal((await sharp(out).metadata()).format, "webp");
    });
  }

  it("fits photos in 800px and covers in 1200px, keeping the ratio", async () => {
    const src = await make("png");
    const photo = await sharp(await processImage(src, "photo")).metadata();
    assert.deepEqual([photo.width, photo.height], [800, 400]);
    const cover = await sharp(await processImage(src, "cover")).metadata();
    assert.deepEqual([cover.width, cover.height], [1200, 600]);
  });

  it("does not enlarge small images", async () => {
    const out = await sharp(
      await processImage(await make("jpeg", 100, 50), "photo"),
    ).metadata();
    assert.deepEqual([out.width, out.height], [100, 50]);
  });

  it("applies the EXIF orientation, then drops metadata", async () => {
    const src = await sharp({
      create: { width: 200, height: 100, channels: 3, background: "#000" },
    })
      .jpeg()
      .withMetadata({ orientation: 6 })
      .toBuffer();
    const meta = await sharp(await processImage(src, "photo")).metadata();
    assert.deepEqual([meta.width, meta.height], [100, 200]);
    assert.equal(meta.exif, undefined);
  });

  it("rejects other formats by magic bytes, whatever the claim", async () => {
    await rejects(await make("gif"), "unsupported");
    await rejects(
      Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'/>"),
      "unsupported",
    );
    await rejects(Buffer.from("not an image"), "unsupported");
    await rejects(Buffer.alloc(0), "unsupported");
  });

  it("rejects over 5 MB", async () => {
    await rejects(Buffer.alloc(MAX_UPLOAD_BYTES + 1), "too_large");
  });

  it("rejects a valid header with a corrupt body", async () => {
    const png = await make("png", 50, 50);
    await rejects(
      Buffer.concat([png.subarray(0, 60), Buffer.alloc(40, 7)]),
      "corrupt",
    );
    await rejects(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]), "corrupt");
  });

  it("drops a polyglot payload appended to a real image", async () => {
    const jpeg = await make("jpeg", 50, 50);
    const evil = Buffer.concat([
      jpeg,
      Buffer.from("<script>alert(1)</script>"),
    ]);
    const out = await processImage(evil, "photo");
    assert.equal(out.includes("<script>"), false);
    assert.equal((await sharp(out).metadata()).format, "webp");
  });
});
