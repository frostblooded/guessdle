import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";
import { Correctness } from "../../src/game/correctness.ts";
import { createApp } from "../../src/server/app.ts";
import { MIGRATIONS_DIR } from "../../src/server/main.ts";
import { migrate } from "../../src/server/migrate.ts";
import { startDb } from "./postgres.ts";
import type { TestDb } from "./postgres.ts";

const NOW = new Date("2026-10-16T10:00:00Z");
const TODAY = "2026-10-16";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Body = any;

// Sequence games (ADR 0020): entries with wide photos shown one at a time, answers the owner
// schedules by date, the oldest never-used entry otherwise, and skips
describe("sequence games", () => {
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
  // A stored 16:9 photo in one colour
  const upload = async (background = "#0a0"): Promise<string> => {
    const png = await sharp({
      create: { width: 160, height: 90, channels: 3, background },
    })
      .png()
      .toBuffer();
    const res = await fetch(`${url}/api/uploads?kind=shot`, {
      method: "POST",
      headers: { "Content-Type": "application/octet-stream", Cookie: ann },
      body: new Uint8Array(png),
    });
    return ((await res.json()) as { url: string }).url;
  };
  const G = "/api/games/seq";
  // An entry with `count` of the game's 3 photos
  const addEntry = async (name: string, count = 3): Promise<Body> => {
    const shots = [];
    for (let i = 0; i < count; i++) {
      shots.push(await upload());
    }
    const res = await request("POST", `${G}/entries`, ann, { name, shots });
    assert.equal(res.status, 200);
    return res.body.find((e: Body) => e.name === name);
  };
  const answers = async (to: string): Promise<Body> =>
    (await request("GET", `${G}/answers?from=${TODAY}&to=${to}`, ann)).body;
  const names = async (to: string): Promise<string[]> =>
    (await answers(to)).days.map((d: Body) => d.name);

  beforeAll(async () => {
    db = await startDb();
    await migrate(db.pool, MIGRATIONS_DIR);
    dir = await mkdtemp(join(tmpdir(), "sequence-"));
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
    await request("POST", "/api/games", ann, { name: "Seq", kind: "sequence" });
  });

  it("starts with 6 photos per entry, takes 1 to 9, and has no attributes", async () => {
    const details = (await request("GET", `${G}/details`, ann)).body;
    assert.equal(details.kind, "sequence");
    assert.equal(details.blurTries, 6);
    assert.equal(
      (await request("PATCH", G, ann, { blurTries: 3 })).body.blurTries,
      3,
    );
    assert.equal(
      (await request("PATCH", G, ann, { blurTries: 10 })).status,
      400,
    );
    assert.equal(
      (
        await request("POST", `${G}/attributes`, ann, {
          name: "Color",
          type: "text",
        })
      ).status,
      400,
    );
  });

  it("saves entries without every photo, which pause the game only while none has them all", async () => {
    await request("PATCH", G, ann, { blurTries: 3 });
    const partial = await addEntry("Partial", 2);
    assert.equal(partial.shots.length, 2);
    await addEntry("Bare", 0);
    let game = (await request("GET", G, ann)).body;
    assert.equal(game.paused, true);
    await addEntry("Full");
    game = (await request("GET", G, ann)).body;
    assert.equal(game.paused, false);
    assert.ok(game.entries.every((e: Body) => e.photo === ""));
    // Every day goes to the one complete entry
    assert.deepEqual(await names("2026-10-18"), ["Full", "Full", "Full"]);
    // Shots belong to the game kind, and to the uploader
    assert.equal(
      (
        await request("POST", `${G}/entries`, ann, {
          name: "X",
          shots: Array(10).fill(""),
        })
      ).status,
      400,
    );
    const bob = await login("bob@example.test");
    const theirs = await (async () => {
      const png = await sharp({
        create: { width: 16, height: 9, channels: 3, background: "#000" },
      })
        .png()
        .toBuffer();
      const res = await fetch(`${url}/api/uploads?kind=shot`, {
        method: "POST",
        headers: { "Content-Type": "application/octet-stream", Cookie: bob },
        body: new Uint8Array(png),
      });
      return ((await res.json()) as { url: string }).url;
    })();
    assert.equal(
      (
        await request("POST", `${G}/entries`, ann, {
          name: "Y",
          shots: [theirs],
        })
      ).status,
      400,
    );
    await request("POST", "/api/games", ann, { name: "Classic" });
    assert.equal(
      (
        await request("POST", "/api/games/classic/entries", ann, {
          name: "C",
          shots: [],
        })
      ).status,
      400,
    );
  });

  it("draws the oldest never-used entry first, then any not used recently", async () => {
    await request("PATCH", G, ann, { blurTries: 3 });
    await addEntry("A");
    await addEntry("B");
    await addEntry("C");
    await request("PATCH", G, ann, { skipPeriod: 1 });
    // random() is 0: once all are used, the first entry outside the skip period of 1 day
    assert.deepEqual(await names("2026-10-21"), ["A", "B", "C", "A", "B", "A"]);
  });

  it("keeps a scheduled entry for its day, and only complete entries may be scheduled", async () => {
    await request("PATCH", G, ann, { blurTries: 3 });
    await addEntry("A");
    await addEntry("B");
    const c = await addEntry("C");
    const partial = await addEntry("Partial", 1);
    assert.deepEqual(await names("2026-10-18"), ["A", "B", "C"]);
    assert.equal(
      (
        await request("PUT", `${G}/answers/2026-10-18`, ann, {
          entryId: partial.id,
        })
      ).status,
      400,
    );
    // C on the 20th: the days before it skip C
    assert.equal(
      (await request("PUT", `${G}/answers/2026-10-20`, ann, { entryId: c.id }))
        .status,
      200,
    );
    const days = await answers("2026-10-20");
    assert.deepEqual(
      days.days.map((d: Body) => d.name),
      ["A", "B", "A", "B", "C"],
    );
    assert.equal(days.days[4].source, "override");
    assert.ok(!days.answerIds.includes(partial.id));
    // Completing an entry brings it up next, ahead of repeats
    await request("PATCH", `${G}/entries/${partial.id}`, ann, {
      shots: [...partial.shots, await upload(), await upload()],
    });
    assert.deepEqual(await names("2026-10-20"), [
      "A",
      "B",
      "Partial",
      "A",
      "C",
    ]);
  });

  it("clears a scheduled day whose entry loses a photo", async () => {
    await request("PATCH", G, ann, { blurTries: 3 });
    await addEntry("A");
    const b = await addEntry("B");
    await request("PUT", `${G}/answers/2026-10-18`, ann, { entryId: b.id });
    await request("PATCH", `${G}/entries/${b.id}`, ann, {
      shots: b.shots.slice(0, 2),
    });
    const days = (await answers("2026-10-18")).days;
    assert.deepEqual(
      days.map((d: Body) => [d.name, d.source]),
      [
        ["A", "generated"],
        ["A", "generated"],
        ["A", "generated"],
      ],
    );
  });

  it("serves the answer's photos one by one up to the game's count, never their URLs", async () => {
    await request("PATCH", G, ann, { blurTries: 3 });
    const a = await addEntry("A");
    await addEntry("B");
    await db.pool.query("update games set status = 'approved'");
    const res = await fetch(`${url}${G}/shot/2`);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("content-type"), "image/webp");
    assert.equal(res.headers.get("cache-control"), "no-store");
    const stored = await readFile(
      join(dir, a.shots[1].slice("/uploads/".length)),
    );
    assert.deepEqual(Buffer.from(await res.arrayBuffer()), stored);
    assert.equal((await fetch(`${url}${G}/shot/4`)).status, 404);
    assert.equal((await fetch(`${url}${G}/shot/0`)).status, 404);
    assert.equal((await fetch(`${url}/api/games/petdle/shot/1`)).status, 404);
    // The banner collage is each entry's first photo, served by index, never its URL
    const card = (await request("GET", "/api/games")).body.find(
      (c: Body) => c.slug === "seq",
    );
    assert.equal(card.kind, "sequence");
    assert.deepEqual(card.photos, [
      "/api/games/seq/tile/0",
      "/api/games/seq/tile/1",
    ]);
    const tile = await fetch(`${url}${card.photos[0]}`);
    assert.equal(tile.status, 200);
    assert.deepEqual(
      Buffer.from(await tile.arrayBuffer()),
      await readFile(join(dir, a.shots[0].slice("/uploads/".length))),
    );
    assert.equal((await fetch(`${url}${G}/tile/2`)).status, 404);
  });

  it("counts a skip as a try, anonymous or signed in", async () => {
    await request("PATCH", G, ann, { blurTries: 3 });
    const a = await addEntry("A");
    const b = await addEntry("B");
    await db.pool.query("update games set status = 'approved'");
    // Today is A, the oldest
    const grade = (ids: number[]) =>
      request("POST", `${G}/grade`, undefined, { ids });
    const skipped = (await grade([0, b.id])).body;
    assert.deepEqual(
      skipped.rows.map((r: Body) => [r[0].value, r[0].correctness]),
      [
        ["Skipped", Correctness.Incorrect],
        ["B", Correctness.Incorrect],
      ],
    );
    assert.equal(skipped.lost, undefined);
    const lost = (await grade([0, 0, 0])).body;
    assert.equal(lost.lost, true);
    assert.equal(lost.answer, "A");
    assert.equal(lost.answerPhoto, a.shots[0]);
    assert.equal((await grade([0, 0, 0, a.id])).body.error, "invalid");
    assert.equal((await grade([0, a.id])).body.victory, true);

    const bob = await login("bob@example.test");
    await request("POST", `${G}/state/guess`, bob, { id: 0 });
    const view = (await request("POST", `${G}/state/guess`, bob, { id: b.id }))
      .body;
    assert.deepEqual(view.ids, [0, b.id]);
    assert.equal(
      (await request("POST", `${G}/state/guess`, bob, { id: 0 })).body.lost,
      true,
    );
    const reset = (await request("POST", `${G}/state/reset`, bob, {})).body;
    assert.deepEqual(reset.ids, []);
    // Skips are adopted from the browser too
    const merged = (
      await request("POST", `${G}/state/merge`, bob, { ids: [0, 0], day: 0 })
    ).body;
    assert.deepEqual(merged.ids, [0, 0]);
    // A classic game has no skip
    assert.equal(
      (
        await request("POST", "/api/games/petdle/grade", undefined, {
          ids: [0],
        })
      ).body.error,
      "invalid",
    );
  });

  it("gives a party round the photos", async () => {
    await request("PATCH", G, ann, { blurTries: 3 });
    await addEntry("A");
    await addEntry("B");
    const host = await request("POST", `${G}/parties`, ann, {
      nickname: "Ann",
    });
    assert.equal(host.status, 201);
    const view = (await request("GET", `/api/parties/${host.body.code}`)).body;
    assert.equal(view.game.kind, "sequence");
    assert.equal(view.game.blurTries, 3);
    assert.ok(view.game.entries.every((e: Body) => e.photo === ""));
    assert.equal(
      (await fetch(`${url}/api/parties/${host.body.code}/shot/1/1`)).status,
      404,
    );
  });
});
