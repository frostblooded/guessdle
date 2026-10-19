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

// Blur games (ADR 0019): entries with a square image and a square order, tries set per game
describe("blur games", () => {
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
  // A stored square photo: its top-left square red, the rest blue
  const upload = async (): Promise<string> => {
    const red = await sharp({
      create: { width: 100, height: 100, channels: 3, background: "#f00" },
    })
      .png()
      .toBuffer();
    const png = await sharp({
      create: { width: 300, height: 300, channels: 3, background: "#00f" },
    })
      .composite([{ input: red, left: 0, top: 0 }])
      .png()
      .toBuffer();
    const res = await fetch(`${url}/api/uploads?kind=photo`, {
      method: "POST",
      headers: { "Content-Type": "application/octet-stream", Cookie: ann },
      body: new Uint8Array(png),
    });
    return ((await res.json()) as { url: string }).url;
  };
  const G = "/api/games/blurry";
  // The middle square first, then the rest row by row
  const ORDER = [4, 0, 1, 2, 3, 5, 6, 7, 8];
  const addEntry = async (name: string): Promise<Body> =>
    request("POST", `${G}/entries`, ann, {
      name,
      photo: await upload(),
      blurOrder: ORDER,
    });
  // Today's answer, read the way an owner can
  const answerName = async (): Promise<string> =>
    (
      await db.pool.query(
        `select e.name from daily_answers d join entries e on e.id = d.entry_id
         join games g on g.id = d.game_id where g.slug = 'blurry'`,
      )
    ).rows[0].name;
  // The colour at a point of a board image
  const pixel = async (image: Buffer, x: number, y: number) => {
    const { data, info } = await sharp(image)
      .raw()
      .toBuffer({ resolveWithObject: true });
    const at = (y * info.width + x) * info.channels;
    return [data[at]!, data[at + 1]!, data[at + 2]!];
  };

  beforeAll(async () => {
    db = await startDb();
    await migrate(db.pool, MIGRATIONS_DIR);
    dir = await mkdtemp(join(tmpdir(), "blur-"));
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
      name: "Blurry",
      kind: "blur",
    });
    await request("PATCH", G, ann, { blurTries: 3 });
  });

  it("creates a Blur game with its tries, and refuses an unknown kind", async () => {
    const details = (await request("GET", `${G}/details`, ann)).body;
    assert.equal(details.kind, "blur");
    assert.equal(details.blurTries, 3);
    assert.equal(
      (await request("POST", "/api/games", ann, { name: "X", kind: "trivia" }))
        .status,
      400,
    );
    // A classic game has no try count
    await request("POST", "/api/games", ann, { name: "Classic" });
    assert.equal(
      (await request("PATCH", "/api/games/classic", ann, { blurTries: 2 }))
        .status,
      400,
    );
    assert.equal(
      (await request("PATCH", G, ann, { blurTries: 10 })).status,
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

  it("needs an image and a full square order on each entry", async () => {
    const photo = await upload();
    const save = (body: Body) => request("POST", `${G}/entries`, ann, body);
    assert.equal((await save({ name: "A" })).body.error, "missing_order");
    assert.equal(
      (await save({ name: "A", photo })).body.error,
      "missing_order",
    );
    assert.equal(
      (await save({ name: "A", blurOrder: ORDER })).body.error,
      "missing_order",
    );
    assert.equal(
      (await save({ name: "A", photo, blurOrder: [0, 1, 2] })).body.error,
      "invalid",
    );
    const ok = await save({ name: "A", photo, blurOrder: ORDER });
    assert.equal(ok.status, 200);
    assert.deepEqual(ok.body[0].blurOrder, ORDER);
    // A rename or a new image keeps the order
    const id = ok.body[0].id;
    assert.equal(
      (await request("PATCH", `${G}/entries/${id}`, ann, { name: "B" })).status,
      200,
    );
    const swapped = await request("PATCH", `${G}/entries/${id}`, ann, {
      photo: await upload(),
    });
    assert.equal(swapped.status, 200);
    assert.deepEqual(swapped.body[0].blurOrder, ORDER);
    // A classic game takes no order
    await request("POST", "/api/games", ann, { name: "Classic" });
    assert.equal(
      (
        await request("POST", "/api/games/classic/entries", ann, {
          name: "C",
          blurOrder: ORDER,
        })
      ).status,
      400,
    );
  });

  it("hides every photo from players and the gallery until the day is over", async () => {
    await addEntry("Alpha");
    await addEntry("Beta");
    await db.pool.query("update games set status = 'approved'");
    const game = (await request("GET", G)).body;
    assert.equal(game.kind, "blur");
    assert.equal(game.blurTries, 3);
    assert.equal(game.paused, false);
    assert.ok(game.entries.every((e: Body) => e.photo === ""));
    const card = (await request("GET", "/api/games")).body.find(
      (c: Body) => c.slug === "blurry",
    );
    assert.equal(card.kind, "blur");
    // The banner collage is blurred tiles served by index, never the photos themselves
    assert.deepEqual(card.photos, [
      "/api/games/blurry/tile/0",
      "/api/games/blurry/tile/1",
    ]);
    const tile = await fetch(`${url}${card.photos[1]}`);
    assert.equal(tile.status, 200);
    assert.equal(tile.headers.get("content-type"), "image/webp");
    const meta = await sharp(Buffer.from(await tile.arrayBuffer())).metadata();
    assert.deepEqual([meta.width, meta.height], [240, 240]);
    assert.equal((await fetch(`${url}${G}/tile/2`)).status, 404);
    assert.equal((await fetch(`${url}/api/games/petdle/tile/0`)).status, 404);
  });

  it("serves today's answer blurred but for the earned squares, up to the tries", async () => {
    await addEntry("Alpha");
    await addEntry("Beta");
    await db.pool.query("update games set status = 'approved'");
    const board = async (n: number): Promise<Buffer> => {
      const res = await fetch(`${url}${G}/blur/${n}`);
      assert.equal(res.status, 200);
      assert.equal(res.headers.get("content-type"), "image/webp");
      assert.equal(res.headers.get("cache-control"), "no-store");
      return Buffer.from(await res.arrayBuffer());
    };
    const first = await board(1);
    const meta = await sharp(first).metadata();
    assert.deepEqual([meta.width, meta.height], [300, 300]);
    // Square 0 (red) clears second: smudged into the blue next to it at first, clear after
    const [r1, , b1] = await pixel(first, 95, 50);
    assert.ok(b1! > 40 && r1! < 230, `blurred, got ${r1},${b1}`);
    const [r2, g2, b2] = await pixel(await board(2), 95, 50);
    assert.ok(r2! > 230 && g2! < 25 && b2! < 25, `clear, got ${r2},${b2}`);
    // No more squares than tries
    assert.equal((await fetch(`${url}${G}/blur/4`)).status, 404);
    assert.equal((await fetch(`${url}${G}/blur/0`)).status, 404);
    assert.equal((await fetch(`${url}/api/games/petdle/blur/1`)).status, 404);
  });

  it("plays, lists and submits with a single entry", async () => {
    const [only] = (await addEntry("Alpha")).body;
    assert.equal((await request("POST", `${G}/submit`, ann)).status, 200);
    await db.pool.query("update games set status = 'approved'");
    const game = (await request("GET", G)).body;
    assert.equal(game.paused, false);
    assert.equal((await fetch(`${url}${G}/blur/1`)).status, 200);
    const won = (
      await request("POST", `${G}/grade`, undefined, { ids: [only.id] })
    ).body;
    assert.equal(won.victory, true);
    assert.ok(
      (await request("GET", "/api/games")).body.some(
        (c: Body) => c.slug === "blurry",
      ),
    );
    // A classic game still needs two
    await request("POST", "/api/games", ann, { name: "Classic" });
    await request("POST", "/api/games/classic/entries", ann, { name: "One" });
    assert.equal(
      (await request("POST", "/api/games/classic/submit", ann)).body.error,
      "too_few_entries",
    );
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

  it("takes skips as tries, beyond the entry count, signed in or not", async () => {
    const [only] = (await addEntry("Alpha")).body;
    await db.pool.query("update games set status = 'approved'");
    const grade = (ids: number[]) =>
      request("POST", `${G}/grade`, undefined, { ids });
    const one = (await grade([0])).body;
    assert.deepEqual(one.rows, [
      [{ key: "skip", value: "Skipped", correctness: 0 }],
    ]);
    const lost = (await grade([0, 0, 0])).body;
    assert.equal(lost.lost, true);
    assert.equal(lost.answer, "Alpha");
    assert.equal((await grade([0, 0, 0, 0])).body.error, "invalid");
    assert.equal((await grade([0, only.id])).body.victory, true);

    const bob = await login("bob@example.test");
    await request("GET", `${G}/state`, bob);
    const skipped = (await request("POST", `${G}/state/guess`, bob, { id: 0 }))
      .body;
    assert.deepEqual(skipped.ids, [0]);
    const again = (await request("POST", `${G}/state/guess`, bob, { id: 0 }))
      .body;
    assert.deepEqual(again.ids, [0, 0]);
    const won = (
      await request("POST", `${G}/state/guess`, bob, { id: only.id })
    ).body;
    assert.deepEqual(won.ids, [0, 0, only.id]);
    assert.equal(won.victory, true);

    // A local game with skips merges into a fresh account in order
    const cy = await login("cy@example.test");
    const merged = (
      await request("POST", `${G}/state/merge`, cy, {
        day: 0,
        ids: [0, 0, only.id],
      })
    ).body;
    assert.deepEqual(merged.ids, [0, 0, only.id]);

    // A classic game takes no skip
    assert.equal(
      (
        await request("POST", "/api/games/petdle/grade", undefined, {
          ids: [0],
        })
      ).body.error,
      "invalid",
    );
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
    // The Past days list calls the day lost, and passes the tries for the browser's own days
    const days = (await request("GET", `${G}/days`, bob)).body;
    assert.equal(days.tries, 3);
    assert.equal(days.days[0].status, "lost");
  });

  it("pauses the game while an entry has no order", async () => {
    await addEntry("Alpha");
    await addEntry("Beta");
    await db.pool.query(
      "update entries set blur_order = null where name = 'Beta'",
    );
    assert.equal(
      (await request("GET", `${G}/details`, ann)).body.incompleteCount,
      1,
    );
    assert.equal((await request("GET", G, ann)).body.paused, true);
  });

  it("gives a party round its board and a try limit", async () => {
    await addEntry("Alpha");
    await addEntry("Beta");
    const host = await request("POST", `${G}/parties`, ann, {
      nickname: "Ann",
    });
    assert.equal(host.status, 201);
    const view = (await request("GET", `/api/parties/${host.body.code}`)).body;
    assert.equal(view.game.kind, "blur");
    assert.equal(view.game.blurTries, 3);
    assert.ok(view.game.entries.every((e: Body) => e.photo === ""));
    // No round yet
    assert.equal(
      (await fetch(`${url}/api/parties/${host.body.code}/blur/1/1`)).status,
      404,
    );
  });
});
