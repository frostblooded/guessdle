import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";
import { createApp } from "../../src/server/app.ts";
import { MIGRATIONS_DIR } from "../../src/server/main.ts";
import { migrate } from "../../src/server/migrate.ts";
import { startDb } from "./postgres.ts";
import type { TestDb } from "./postgres.ts";

const NOW = new Date("2026-10-16T10:00:00Z");

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Body = any;

// Zoom games (ADR 0019): entries with an uncropped image and square parts, one try per part
describe("zoom games", () => {
  let db: TestDb;
  let server: Server;
  let url: string;
  let dir: string;
  let ann: string;

  const request = async (
    method: string,
    path: string,
    cookie?: string,
    body?: unknown,
  ): Promise<{ status: number; body: Body }> => {
    const res = await fetch(`${url}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(cookie && { Cookie: cookie }),
      },
      ...(body !== undefined && { body: JSON.stringify(body) }),
    });
    return { status: res.status, body: await res.json() };
  };
  const login = async (email: string): Promise<string> => {
    const res = await fetch(`${url}/api/test/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    return res.headers.get("set-cookie")!.split(";")[0]!;
  };
  // A stored zoom image of w x h pixels
  const upload = async (w: number, h: number): Promise<string> => {
    const png = await sharp({
      create: { width: w, height: h, channels: 3, background: "#369" },
    })
      .png()
      .toBuffer();
    const res = await fetch(`${url}/api/uploads?kind=zoom`, {
      method: "POST",
      headers: { "Content-Type": "application/octet-stream", Cookie: ann },
      body: new Uint8Array(png),
    });
    return ((await res.json()) as { url: string }).url;
  };
  const G = "/api/games/zoomy";
  const parts = (n: number) =>
    Array.from({ length: n }, (_, i) => ({
      x: 10 * i,
      y: 0,
      size: 50 + i,
    }));
  const addEntry = async (name: string, count = 3): Promise<Body> =>
    request("POST", `${G}/entries`, ann, {
      name,
      photo: await upload(400, 300),
      parts: parts(count),
    });
  // Today's answer, read the way an owner can
  const answerName = async (): Promise<string> =>
    (
      await db.pool.query(
        `select e.name from daily_answers d join entries e on e.id = d.entry_id
         join games g on g.id = d.game_id where g.slug = 'zoomy'`,
      )
    ).rows[0].name;

  beforeAll(async () => {
    db = await startDb();
    await migrate(db.pool, MIGRATIONS_DIR);
    dir = await mkdtemp(join(tmpdir(), "zoom-"));
    server = await new Promise<Server>((resolve) => {
      const s = createApp({
        pool: db.pool,
        now: () => NOW,
        random: () => 0,
        testLogin: true,
        uploadsDir: dir,
        writeLimit: { max: 1000, windowMs: 60_000 },
        uploadLimit: { max: 1000, windowMs: 60_000 },
      }).listen(0, "127.0.0.1", () => resolve(s));
    });
    url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(async () => {
    server.close();
    await db.stop();
    await rm(dir, { recursive: true, force: true });
  });
  beforeEach(async () => {
    await db.pool.query("delete from users");
    await db.pool.query("delete from games where slug <> 'petdle'");
    ann = await login("ann@example.test");
    await request("POST", "/api/games", ann, {
      name: "Zoomy",
      kind: "zoom",
    });
    await request("PATCH", G, ann, { zoomParts: 3 });
  });

  it("creates a Zoom game with its part count, and refuses an unknown kind", async () => {
    const details = (await request("GET", `${G}/details`, ann)).body;
    assert.equal(details.kind, "zoom");
    assert.equal(details.zoomParts, 3);
    assert.equal(
      (await request("POST", "/api/games", ann, { name: "X", kind: "quiz" }))
        .status,
      400,
    );
    // A classic game has no part count
    await request("POST", "/api/games", ann, { name: "Classic" });
    assert.equal(
      (await request("PATCH", "/api/games/classic", ann, { zoomParts: 2 }))
        .status,
      400,
    );
    assert.equal(
      (await request("PATCH", G, ann, { zoomParts: 7 })).status,
      400,
    );
  });

  it("has no attributes", async () => {
    const res = await request("POST", `${G}/attributes`, ann, {
      name: "Color",
      type: "text",
    });
    assert.equal(res.status, 400);
  });

  it("needs an image and every part inside it on each entry", async () => {
    const photo = await upload(400, 300);
    const save = (body: Body) => request("POST", `${G}/entries`, ann, body);
    assert.equal((await save({ name: "A" })).body.error, "missing_parts");
    assert.equal(
      (await save({ name: "A", photo, parts: parts(2) })).body.error,
      "missing_parts",
    );
    // Off the image's right edge
    assert.equal(
      (
        await save({
          name: "A",
          photo,
          parts: [...parts(2), { x: 380, y: 0, size: 40 }],
        })
      ).body.error,
      "invalid",
    );
    const ok = await save({ name: "A", photo, parts: parts(3) });
    assert.equal(ok.status, 200);
    assert.deepEqual(ok.body[0].parts, parts(3));
    // A rename keeps the photo and its parts; a new photo needs new parts
    const id = ok.body[0].id;
    assert.equal(
      (await request("PATCH", `${G}/entries/${id}`, ann, { name: "B" })).status,
      200,
    );
    assert.equal(
      (
        await request("PATCH", `${G}/entries/${id}`, ann, {
          photo: await upload(400, 300),
        })
      ).body.error,
      "missing_parts",
    );
  });

  it("hides every photo from players and the gallery until the day is over", async () => {
    await addEntry("Alpha");
    await addEntry("Beta");
    await db.pool.query("update games set status = 'approved'");
    const game = (await request("GET", G)).body;
    assert.equal(game.kind, "zoom");
    assert.equal(game.zoomParts, 3);
    assert.equal(game.paused, false);
    assert.ok(game.entries.every((e: Body) => e.photo === ""));
    const card = (await request("GET", "/api/games")).body.find(
      (c: Body) => c.slug === "zoomy",
    );
    assert.deepEqual(card.photos, []);
    assert.equal(card.kind, "zoom");
  });

  it("serves today's answer's parts as images, and nothing past the last", async () => {
    await addEntry("Alpha");
    await addEntry("Beta");
    await db.pool.query("update games set status = 'approved'");
    const part = await fetch(`${url}${G}/zoom/1`);
    assert.equal(part.status, 200);
    assert.equal(part.headers.get("content-type"), "image/webp");
    assert.equal(part.headers.get("cache-control"), "no-store");
    const meta = await sharp(Buffer.from(await part.arrayBuffer())).metadata();
    assert.deepEqual([meta.width, meta.height], [640, 640]);
    assert.equal((await fetch(`${url}${G}/zoom/4`)).status, 404);
    assert.equal((await fetch(`${url}/api/games/petdle/zoom/1`)).status, 404);
  });

  it("grades by name only and ends the day after the last try", async () => {
    const entries = [];
    for (const name of ["Alpha", "Beta", "Gamma", "Delta"]) {
      entries.push(...(await addEntry(name)).body.slice(-1));
    }
    await db.pool.query("update games set status = 'approved'");
    await request("POST", `${G}/give-up`);
    const answer = await answerName();
    const wrong = entries
      .filter((e: Body) => e.name !== answer)
      .map((e: Body) => e.id);
    const right = entries.find((e: Body) => e.name === answer).id;
    const grade = (ids: number[]) =>
      request("POST", `${G}/grade`, undefined, { ids });

    const first = (await grade(wrong.slice(0, 1))).body;
    assert.deepEqual(Object.keys(first.rows[0][0]).sort(), [
      "correctness",
      "key",
      "value",
    ]);
    assert.equal(first.rows[0].length, 1);
    assert.equal(first.answer, undefined);

    const lost = (await grade(wrong.slice(0, 3))).body;
    assert.equal(lost.lost, true);
    assert.equal(lost.victory, false);
    assert.equal(lost.answer, answer);
    assert.match(lost.answerPhoto, /^\/uploads\/[0-9a-f]{32}\.webp$/);
    // No fourth try
    assert.equal(
      (await grade([...wrong.slice(0, 3), right])).body.error,
      "invalid",
    );

    const won = (await grade([wrong[0], right])).body;
    assert.equal(won.victory, true);
    assert.equal(won.lost, undefined);
    assert.ok(won.answerPhoto);
  });

  it("keeps a signed-in player to the tries", async () => {
    const entries = [];
    for (const name of ["Alpha", "Beta", "Gamma", "Delta"]) {
      entries.push(...(await addEntry(name)).body.slice(-1));
    }
    await db.pool.query("update games set status = 'approved'");
    const bob = await login("bob@example.test");
    await request("GET", `${G}/state`, bob);
    const answer = await answerName();
    const wrong = entries.filter((e: Body) => e.name !== answer);
    let view: Body;
    for (const entry of wrong) {
      view = (await request("POST", `${G}/state/guess`, bob, { id: entry.id }))
        .body;
    }
    assert.equal(view.lost, true);
    assert.equal(view.answer, answer);
    assert.ok(view.answerPhoto);
    const right = entries.find((e: Body) => e.name === answer);
    assert.equal(
      (await request("POST", `${G}/state/guess`, bob, { id: right.id })).body
        .error,
      "finished",
    );
  });

  it("pauses the game when the part count grows, and trims parts when it shrinks", async () => {
    await addEntry("Alpha");
    await addEntry("Beta");
    await request("PATCH", G, ann, { zoomParts: 4 });
    assert.equal(
      (await request("GET", `${G}/details`, ann)).body.incompleteCount,
      2,
    );
    assert.equal((await request("GET", G, ann)).body.paused, true);
    await request("PATCH", G, ann, { zoomParts: 2 });
    const entries = (await request("GET", `${G}/entries`, ann)).body;
    assert.deepEqual(entries[0].parts, parts(2));
    assert.equal((await request("GET", G, ann)).body.paused, false);
  });

  it("gives a party round its parts and a try limit", async () => {
    await addEntry("Alpha");
    await addEntry("Beta");
    const host = await request("POST", `${G}/parties`, ann, {
      nickname: "Ann",
    });
    assert.equal(host.status, 201);
    const view = (await request("GET", `/api/parties/${host.body.code}`)).body;
    assert.equal(view.game.kind, "zoom");
    assert.equal(view.game.zoomParts, 3);
    assert.ok(view.game.entries.every((e: Body) => e.photo === ""));
    // No round yet
    assert.equal(
      (await fetch(`${url}/api/parties/${host.body.code}/zoom/1/1`)).status,
      404,
    );
  });
});
