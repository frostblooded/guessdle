import assert from "node:assert/strict";
import { mkdtemp, readdir, rm, utimes, writeFile } from "node:fs/promises";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, beforeEach, describe, it } from "node:test";
import sharp from "sharp";
import { createApp } from "../../src/server/app.ts";
import { MIGRATIONS_DIR } from "../../src/server/main.ts";
import { migrate } from "../../src/server/migrate.ts";
import {
  removeUpload,
  sweepUploads,
  usedBytes,
} from "../../src/server/upload-store.ts";
import { startDb } from "./postgres.ts";
import type { TestDb } from "./postgres.ts";

describe("upload hygiene", () => {
  let db: TestDb;
  let server: Server;
  let url: string;
  let dir: string;
  let png: Buffer;
  let webpBytes: number;
  let uploadQuotaBytes: number;
  let max: number;

  const login = async (email: string): Promise<string> => {
    const res = await fetch(`${url}/api/test/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    return res.headers.get("set-cookie")!.split(";")[0]!;
  };
  const upload = async (
    cookie: string,
  ): Promise<{ status: number; body: { url?: string; error?: string } }> => {
    const res = await fetch(`${url}/api/uploads?kind=photo`, {
      method: "POST",
      headers: {
        "Content-Type": "application/octet-stream",
        Cookie: cookie,
      },
      body: new Uint8Array(png),
    });
    return {
      status: res.status,
      body: (await res.json()) as { url?: string; error?: string },
    };
  };
  const userId = async (email: string): Promise<number> =>
    (
      await db.pool.query<{ id: number }>(
        "select id from users where email = $1",
        [email],
      )
    ).rows[0]!.id;

  before(async () => {
    db = await startDb();
    await migrate(db.pool, MIGRATIONS_DIR);
    dir = await mkdtemp(join(tmpdir(), "hygiene-"));
    png = await sharp({
      create: { width: 40, height: 40, channels: 3, background: "#369" },
    })
      .png()
      .toBuffer();
    webpBytes = (await sharp(png).webp().toBuffer()).length;
    // Quota of two files; limit of three uploads per window
    uploadQuotaBytes = webpBytes * 2 + 10;
    max = 3;
    server = await new Promise<Server>((resolve) => {
      const s = createApp({
        pool: db.pool,
        uploadsDir: dir,
        testLogin: true,
        uploadLimit: { max, windowMs: 60_000 },
        uploadQuotaBytes,
      }).listen(0, "127.0.0.1", () => resolve(s));
    });
    url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  after(async () => {
    server.close();
    await db.stop();
    await rm(dir, { recursive: true, force: true });
  });
  beforeEach(async () => {
    await db.pool.query("delete from uploads");
    for (const f of await readdir(dir)) {
      await rm(join(dir, f));
    }
  });

  it("rejects an upload over the byte quota with 403 and stores nothing", async () => {
    const cookie = await login("quota@x.test");
    assert.equal((await upload(cookie)).status, 200);
    assert.equal((await upload(cookie)).status, 200);
    const res = await upload(cookie);
    assert.deepEqual([res.status, res.body.error], [403, "quota_exceeded"]);
    assert.equal((await readdir(dir)).length, 2);
  });

  it("counts quota per user", async () => {
    const a = await login("qa@x.test");
    const b = await login("qb@x.test");
    await upload(a);
    await upload(a);
    assert.equal((await upload(b)).status, 200);
  });

  it("removing an upload deletes the file and frees the quota", async () => {
    const cookie = await login("free@x.test");
    const first = await upload(cookie);
    await upload(cookie);
    await removeUpload(db.pool, dir, first.body.url);
    assert.equal((await readdir(dir)).length, 1);
    assert.equal(
      await usedBytes(db.pool, await userId("free@x.test")),
      webpBytes,
    );
    assert.equal((await upload(cookie)).status, 200);
  });

  it("removing a missing file or a foreign URL is harmless", async () => {
    const gone = `/uploads/${"a".repeat(32)}.webp`;
    await removeUpload(db.pool, dir, gone);
    await removeUpload(db.pool, dir, "/uploads/../../etc/passwd");
    await removeUpload(db.pool, dir, null);
  });

  it("rate limits uploads per user with 429 and a Retry-After", async () => {
    const cookie = await login("rate@x.test");
    for (let i = 0; i < max; i++) {
      // Keep the quota out of the way so only the rate limit can answer 429
      const res = await upload(cookie);
      assert.notEqual(res.status, 429);
      await db.pool.query("delete from uploads");
    }
    assert.equal((await upload(cookie)).status, 429);
    // Another user is unaffected
    assert.equal((await upload(await login("rate2@x.test"))).status, 200);
  });

  it("sweep deletes unreferenced files older than a day and keeps fresh ones", async () => {
    const cookie = await login("sweep@x.test");
    const old = (await upload(cookie)).body.url!;
    const fresh = (await upload(cookie)).body.url!;
    const now = new Date();
    const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 3600_000);
    await utimes(join(dir, old.slice(9)), twoDaysAgo, twoDaysAgo);
    const removed = await sweepUploads(db.pool, dir, now);
    assert.deepEqual(removed, [old.slice(9)]);
    assert.deepEqual(await readdir(dir), [fresh.slice(9)]);
    assert.equal(
      await usedBytes(db.pool, await userId("sweep@x.test")),
      webpBytes,
    );
  });

  it("sweep keeps files used as a game cover or an entry photo", async () => {
    const cookie = await login("refs@x.test");
    const cover = (await upload(cookie)).body.url!;
    const photo = (await upload(cookie)).body.url!;
    // Written directly: the quota allows only two uploads
    const orphan = `/uploads/${"a".repeat(32)}.webp`;
    await writeFile(join(dir, orphan.slice(9)), "x");
    await db.pool.query(
      "insert into games (slug, name, start_date, cover_url) values ('refs', 'Refs', '2026-10-16', $1)",
      [cover],
    );
    await db.pool.query(
      "insert into entries (game_id, name, photo_url) select id, 'A', $1 from games where slug = 'refs'",
      [photo],
    );
    const old = new Date(Date.now() - 3 * 24 * 3600_000);
    for (const u of [cover, photo, orphan]) {
      await utimes(join(dir, u.slice(9)), old, old);
    }
    assert.deepEqual(await sweepUploads(db.pool, dir, new Date()), [
      orphan.slice(9),
    ]);
    assert.deepEqual(
      (await readdir(dir)).sort(),
      [cover.slice(9), photo.slice(9)].sort(),
    );
    await db.pool.query("delete from games where slug = 'refs'");
  });

  it("sweep leaves files that are not ours and drops quota rows of vanished old files", async () => {
    const cookie = await login("vanish@x.test");
    const url1 = (await upload(cookie)).body.url!;
    await rm(join(dir, url1.slice(9)));
    await db.pool.query(
      "update uploads set created_at = now() - interval '3 days'",
    );
    const stray = join(dir, "notes.txt");
    await writeFile(stray, "x");
    const old = new Date(Date.now() - 3 * 24 * 3600_000);
    await utimes(stray, old, old);
    assert.deepEqual(await sweepUploads(db.pool, dir, new Date()), []);
    assert.deepEqual(await readdir(dir), ["notes.txt"]);
    assert.equal(await usedBytes(db.pool, await userId("vanish@x.test")), 0);
  });
});
