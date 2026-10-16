import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import sharp from "sharp";
import { createApp } from "../../src/server/app.ts";
import { MIGRATIONS_DIR } from "../../src/server/main.ts";
import { migrate } from "../../src/server/migrate.ts";
import { startDb } from "./postgres.ts";
import type { TestDb } from "./postgres.ts";

describe("POST /api/uploads", () => {
  let db: TestDb;
  let server: Server;
  let url: string;
  let dir: string;
  let cookie: string;

  const upload = async (
    body: Buffer,
    query = "?kind=photo",
    headers: Record<string, string> = {},
  ): Promise<{ status: number; body: { url?: string; error?: string } }> => {
    const res = await fetch(`${url}/api/uploads${query}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/octet-stream",
        Cookie: cookie,
        ...headers,
      },
      body: new Uint8Array(body),
    });
    return {
      status: res.status,
      body: (await res.json()) as { url?: string; error?: string },
    };
  };
  const png = (w: number, h: number): Promise<Buffer> =>
    sharp({ create: { width: w, height: h, channels: 3, background: "#369" } })
      .png()
      .toBuffer();

  before(async () => {
    db = await startDb();
    await migrate(db.pool, MIGRATIONS_DIR);
    dir = await mkdtemp(join(tmpdir(), "uploads-"));
    server = await new Promise<Server>((resolve) => {
      const s = createApp({
        pool: db.pool,
        uploadsDir: dir,
        testLogin: true,
      }).listen(0, "127.0.0.1", () => resolve(s));
    });
    url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const login = await fetch(`${url}/api/test/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "u@x.test" }),
    });
    cookie = login.headers.get("set-cookie")!.split(";")[0]!;
  });
  after(async () => {
    server.close();
    await db.stop();
    await rm(dir, { recursive: true, force: true });
  });

  it("stores a resized WebP under a random hex name and returns its URL", async () => {
    const res = await upload(await png(2000, 1000));
    assert.equal(res.status, 200);
    assert.match(res.body.url!, /^\/uploads\/[0-9a-f]{32}\.webp$/);
    const file = await readFile(join(dir, res.body.url!.slice(9)));
    const meta = await sharp(file).metadata();
    assert.deepEqual(
      [meta.format, meta.width, meta.height],
      ["webp", 800, 400],
    );
  });

  it("uses the 1200px limit for covers", async () => {
    const res = await upload(await png(2000, 1000), "?kind=cover");
    const file = await readFile(join(dir, res.body.url!.slice(9)));
    assert.equal((await sharp(file).metadata()).width, 1200);
  });

  it("answers 401 without a session and stores nothing", async () => {
    const before = (await readdir(dir)).length;
    const res = await upload(await png(10, 10), "?kind=photo", { Cookie: "" });
    assert.equal(res.status, 401);
    assert.equal((await readdir(dir)).length, before);
  });

  it("rejects a missing or unknown kind", async () => {
    assert.equal((await upload(await png(10, 10), "")).status, 400);
    assert.equal((await upload(await png(10, 10), "?kind=x")).status, 400);
  });

  it("rejects an unsupported type with 415, whatever the content type says", async () => {
    const res = await upload(Buffer.from("<svg/>"));
    assert.equal(res.status, 415);
    assert.equal(res.body.error, "unsupported");
  });

  it("rejects a corrupt image with 422", async () => {
    const bad = Buffer.concat([
      (await png(50, 50)).subarray(0, 60),
      Buffer.alloc(40, 7),
    ]);
    const res = await upload(bad);
    assert.equal(res.status, 422);
    assert.equal(res.body.error, "corrupt");
  });

  it("rejects an empty body", async () => {
    assert.equal((await upload(Buffer.alloc(0))).status, 415);
  });

  it("rejects over 5 MB with 413", async () => {
    const big = Buffer.alloc(5 * 1024 * 1024 + 1);
    big[0] = 0xff;
    big[1] = 0xd8;
    big[2] = 0xff;
    const res = await upload(big);
    assert.equal(res.status, 413);
    assert.equal(res.body.error, "too_large");
  });

  it("rejects a form content type (cross-site forms)", async () => {
    const res = await upload(await png(10, 10), "?kind=photo", {
      "Content-Type": "multipart/form-data; boundary=x",
    });
    assert.equal(res.status, 415);
  });
});
