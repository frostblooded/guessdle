import assert from "node:assert/strict";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";
import { createApp } from "../../src/server/app.ts";
import { IMPORT_FORMAT } from "../../src/game/import-file.ts";
import { MIGRATIONS_DIR } from "../../src/server/main.ts";
import { migrate } from "../../src/server/migrate.ts";
import { startDb } from "./postgres.ts";
import type { TestDb } from "./postgres.ts";

const NOW = new Date("2026-10-16T10:00:00Z");
const POSTER = "https://upload.wikimedia.org/wikipedia/en/1/13/Toy_Story.jpg";
const BROKEN = "https://upload.wikimedia.org/wikipedia/en/0/00/Broken.jpg";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Body = any;

const file = (entries: Body[], attributes?: Body[]): Body => ({
  format: IMPORT_FORMAT,
  source: "https://en.wikipedia.org/wiki/List_of_Pixar_films",
  attributes: attributes ?? [
    { name: "Directed by", type: "list" },
    { name: "Running time", type: "number" },
  ],
  entries,
});

const toyStory = {
  name: "Toy Story",
  image: POSTER,
  values: { "Directed by": ["John Lasseter"], "Running time": "81" },
};
const bugsLife = {
  name: "A Bug's Life",
  image: null,
  values: {
    "Directed by": ["John Lasseter", "Andrew Stanton"],
    "Running time": 95,
  },
};

describe("game import", () => {
  let db: TestDb;
  let server: Server;
  let url: string;
  let ann: string;
  let dir: string;
  const fetched: string[] = [];

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
  const I = "/api/games/ann-game/import";
  const attributes = async (): Promise<Body[]> =>
    (await request("GET", "/api/games/ann-game/attributes", ann)).body;
  const entries = async (): Promise<Body[]> =>
    (await request("GET", "/api/games/ann-game/entries", ann)).body;

  beforeAll(async () => {
    db = await startDb();
    await migrate(db.pool, MIGRATIONS_DIR);
    dir = await mkdtemp(join(tmpdir(), "import-"));
    const poster = await sharp({
      create: {
        width: 300,
        height: 450,
        channels: 3,
        background: { r: 200, g: 60, b: 40 },
      },
    })
      .composite([
        {
          input: {
            create: {
              width: 300,
              height: 150,
              channels: 3,
              background: { r: 20, g: 40, b: 220 },
            },
          },
          top: 0,
          left: 0,
        },
      ])
      .png()
      .toBuffer();
    server = await new Promise<Server>((resolve) => {
      const s = createApp({
        pool: db.pool,
        now: () => NOW,
        random: () => 0,
        testLogin: true,
        uploadsDir: dir,
        writeLimit: { max: 1000, windowMs: 60_000 },
        fetchImage: async (image) => {
          fetched.push(image);
          if (image === BROKEN) {
            throw new Error("404");
          }
          return poster;
        },
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
    fetched.length = 0;
    await db.pool.query("delete from users");
    await db.pool.query("delete from games where slug <> 'petdle'");
    ann = await login("ann@example.test");
    await request("POST", "/api/games", ann, { name: "Ann Game" });
  });

  it("adds the attributes, a Photo column and every entry with its values", async () => {
    const res = await request("POST", I, ann, file([toyStory, bugsLife]));
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, {
      added: 2,
      filled: 0,
      unchanged: 0,
      missingImages: 0,
    });
    const attrs = await attributes();
    assert.deepEqual(
      attrs.map((a: Body) => [a.name, a.type]),
      [
        ["Directed by", "list"],
        ["Running time", "number"],
        ["Photo", "image"],
      ],
    );
    const [directed, running, photo] = attrs.map((a: Body): string =>
      String(a.id),
    ) as string[];
    const rows = await entries();
    const toy = rows.find((e: Body) => e.name === "Toy Story");
    const bug = rows.find((e: Body) => e.name === "A Bug's Life");
    assert.deepEqual(toy.values[directed!], ["John Lasseter"]);
    assert.deepEqual(toy.values[running!], ["81"]);
    assert.match(toy.values[photo!][0], /^\/uploads\/[0-9a-f]{32}\.webp$/);
    assert.deepEqual(bug.values[directed!], [
      "John Lasseter",
      "Andrew Stanton",
    ]);
    assert.equal(bug.values[photo!], undefined);
    assert.deepEqual(fetched, [POSTER]);
    const [stored] = await readdir(dir);
    const meta = await sharp(join(dir, stored!)).metadata();
    assert.equal(meta.width, meta.height);
  });

  it("fills only blanks on entries that already exist and keeps their values", async () => {
    await request("POST", I, ann, file([toyStory]));
    const changed = {
      ...toyStory,
      values: { "Directed by": ["Someone Else"], "Running time": "1" },
    };
    const withCountry = (entry: Body): Body => ({
      ...entry,
      values: { ...entry.values, Country: "USA" },
    });
    const again = await request(
      "POST",
      I,
      ann,
      file(
        [withCountry(changed), withCountry(bugsLife)],
        [
          { name: "Directed by", type: "list" },
          { name: "Running time", type: "number" },
          { name: "Country", type: "text" },
        ],
      ),
    );
    assert.equal(again.status, 200);
    assert.deepEqual(again.body, {
      added: 1,
      filled: 1,
      unchanged: 0,
      missingImages: 0,
    });
    assert.equal(fetched.length, 1);
    const attrs = await attributes();
    assert.equal(attrs.length, 4);
    const [directed, , , country] = attrs.map((a: Body): string =>
      String(a.id),
    ) as string[];
    const toy = (await entries()).find((e: Body) => e.name === "Toy Story");
    assert.deepEqual(toy.values[directed!], ["John Lasseter"]);
    assert.deepEqual(toy.values[country!], ["USA"]);
    const third = await request("POST", I, ann, file([toyStory]));
    assert.deepEqual(third.body.unchanged, 1);
  });

  it("crops the picture to the square picked in the picker", async () => {
    const res = await request(
      "POST",
      I,
      ann,
      file([
        {
          ...toyStory,
          crop: { left: 0.25, top: 0, width: 0.5, height: 1 / 3 },
        },
      ]),
    );
    assert.equal(res.status, 200);
    const photo = (await attributes()).find((a: Body) => a.type === "image");
    const toy = (await entries())[0];
    const stored = join(dir, toy.values[String(photo.id)][0].slice(9));
    const { width, height } = await sharp(stored).metadata();
    assert.deepEqual([width, height], [150, 150]);
    const { channels } = await sharp(stored).stats();
    assert.ok(channels[2]!.mean > 150 && channels[0]!.mean < 80);
  });

  it("imports an entry whose image fails and counts it as missing", async () => {
    const res = await request(
      "POST",
      I,
      ann,
      file([{ ...toyStory, image: BROKEN }]),
    );
    assert.equal(res.status, 200);
    assert.equal(res.body.added, 1);
    assert.equal(res.body.missingImages, 1);
    assert.deepEqual(
      (await attributes()).map((a: Body) => a.name),
      ["Directed by", "Running time"],
    );
  });

  it("refuses broken files, images from other sites and type clashes", async () => {
    const bad = [
      { format: "other" },
      file([]),
      file([{ ...toyStory, image: "https://evil.example/x.jpg" }]),
      file([
        { ...toyStory, crop: { left: 0.6, top: 0, width: 0.5, height: 0.2 } },
      ]),
      file([{ ...toyStory, values: { "Directed by": ["X"] } }]),
      file([
        { ...toyStory, values: { ...toyStory.values, "Running time": "long" } },
      ]),
      file([toyStory, { ...toyStory, name: "toy story" }]),
    ];
    const filesBefore = (await readdir(dir)).length;
    for (const body of bad) {
      const res = await request("POST", I, ann, body);
      assert.equal(res.status, 400, JSON.stringify(body).slice(0, 80));
      assert.equal(res.body.error, "import_invalid");
    }
    await request("POST", "/api/games/ann-game/attributes", ann, {
      name: "Running time",
      type: "text",
    });
    const clash = await request("POST", I, ann, file([toyStory]));
    assert.equal(clash.status, 409);
    assert.equal(clash.body.error, "import_type_clash");
    assert.deepEqual(await entries(), []);
    assert.deepEqual(fetched, [POSTER]);
    assert.equal((await readdir(dir)).length, filesBefore);
  });

  it("is for the game's editors only and sends an approved game back to review", async () => {
    const bob = await login("bob@example.test");
    assert.equal((await request("POST", I, bob, file([bugsLife]))).status, 404);
    await request("POST", I, ann, file([bugsLife]));
    await db.pool.query("update games set status = 'approved'");
    assert.equal((await request("POST", I, bob, file([bugsLife]))).status, 403);
    await request("POST", I, ann, file([{ ...bugsLife, name: "Cars" }]));
    const { rows } = await db.pool.query(
      "select status from games where slug = 'ann-game'",
    );
    assert.equal(rows[0].status, "pending");
  });
});
