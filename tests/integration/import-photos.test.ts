import assert from "node:assert/strict";
import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import sharp from "sharp";
import { importPhotos } from "../../src/server/import-photos.ts";
import { MIGRATIONS_DIR } from "../../src/server/main.ts";
import { migrate } from "../../src/server/migrate.ts";
import { usedBytes } from "../../src/server/upload-store.ts";
import { startDb } from "./postgres.ts";
import type { TestDb } from "./postgres.ts";

const UPLOAD_URL = /^\/uploads\/[0-9a-f]{32}\.webp$/;

describe("importPhotos", () => {
  let db: TestDb;
  let photos: string;
  let uploads: string;
  let userId: number;

  const urls = async (): Promise<string[]> =>
    (
      await db.pool.query<{ photo_url: string }>(
        "select photo_url from entries order by id",
      )
    ).rows.map((r) => r.photo_url);

  before(async () => {
    db = await startDb();
    await migrate(db.pool, MIGRATIONS_DIR);
    photos = await mkdtemp(join(tmpdir(), "photos-"));
    uploads = await mkdtemp(join(tmpdir(), "uploads-"));
    const jpeg = await sharp({
      create: { width: 40, height: 30, channels: 3, background: "#963" },
    })
      .jpeg()
      .toBuffer();
    // Every roster photo exists except todorka's
    for (const url of await urls()) {
      const slug = url.slice("/photos/".length, -".jpg".length);
      if (slug !== "todorka") {
        await writeFile(join(photos, `${slug}.jpg`), jpeg);
      }
    }
    await writeFile(join(photos, "cover.jpg"), jpeg);
    const { rows } = await db.pool.query<{ id: number }>(
      "insert into users (email, name) values ('a@b.c', 'A') returning id",
    );
    userId = rows[0]!.id;
  });
  after(async () => {
    await db.stop();
    await rm(photos, { recursive: true, force: true });
    await rm(uploads, { recursive: true, force: true });
  });

  it("moves photos and cover to uploads, charges the owner, and is rerunnable", async () => {
    const result = await importPhotos(db.pool, {
      photosDir: photos,
      uploadsDir: uploads,
      userId,
      coverFile: join(photos, "cover.jpg"),
    });
    assert.equal(result.imported, 18);
    assert.deepEqual(result.missing, ["todorka"]);

    const moved = await urls();
    assert.equal(moved.filter((u) => UPLOAD_URL.test(u)).length, 18);
    assert.equal(moved[18], "/photos/todorka.jpg");
    const { rows } = await db.pool.query<{ cover_url: string }>(
      "select cover_url from games where slug = 'petdle'",
    );
    assert.match(rows[0]!.cover_url, UPLOAD_URL);
    assert.equal((await readdir(uploads)).length, 19);
    assert.ok((await usedBytes(db.pool, userId)) > 0);

    const again = await importPhotos(db.pool, {
      photosDir: photos,
      uploadsDir: uploads,
      userId,
    });
    assert.equal(again.imported, 0);
    assert.deepEqual(again.missing, ["todorka"]);
    assert.equal((await readdir(uploads)).length, 19);
  });
});
