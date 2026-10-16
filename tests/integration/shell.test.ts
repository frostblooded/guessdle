import assert from "node:assert/strict";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { after, afterEach, before, describe, it } from "node:test";
import { createApp } from "../../src/server/app.ts";
import { MIGRATIONS_DIR } from "../../src/server/main.ts";
import { migrate } from "../../src/server/migrate.ts";
import { startDb } from "./postgres.ts";
import type { TestDb } from "./postgres.ts";

const SLUG = "shelly";

describe("game shell with link-preview meta", () => {
  let db: TestDb;
  let server: Server;
  let url: string;

  const page = async (
    path: string,
    cookie?: string,
  ): Promise<{ status: number; html: string; cache: string | null }> => {
    const res = await fetch(`${url}${path}`, {
      headers: cookie ? { Cookie: cookie } : {},
    });
    return {
      status: res.status,
      html: await res.text(),
      cache: res.headers.get("cache-control"),
    };
  };
  const login = async (email: string, admin = false): Promise<string> => {
    const res = await fetch(`${url}/api/test/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, admin }),
    });
    return res.headers.get("set-cookie")!.split(";")[0]!;
  };
  const makeGame = async (
    status: string,
    entries: number,
    over: { name?: string; description?: string; cover?: string } = {},
    ownerEmail?: string,
  ): Promise<void> => {
    await db.pool.query(
      `insert into games (slug, name, description, cover_url, status, start_date, owner_id)
       values ($1, $2, $3, $4, $5, '2026-10-16',
               (select id from users where email = $6))`,
      [
        SLUG,
        over.name ?? "Shelly",
        over.description ?? "Guess the shell",
        over.cover ?? "",
        status,
        ownerEmail ?? null,
      ],
    );
    for (let i = 0; i < entries; i++) {
      await db.pool.query(
        "insert into entries (game_id, name) select id, $1 from games where slug = $2",
        [`E${i}`, SLUG],
      );
    }
  };

  before(async () => {
    db = await startDb();
    await migrate(db.pool, MIGRATIONS_DIR);
    server = await new Promise<Server>((resolve) => {
      const s = createApp({ pool: db.pool, testLogin: true }).listen(
        0,
        "127.0.0.1",
        () => resolve(s),
      );
    });
    url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  after(async () => {
    server.close();
    await db.stop();
  });
  afterEach(async () => {
    await db.pool.query("delete from games where slug = $1", [SLUG]);
  });

  it("injects title, description and og tags for an approved playable game", async () => {
    await makeGame("approved", 2, { cover: "/uploads/c.webp" });
    const { status, html, cache } = await page(`/g/${SLUG}`);
    assert.equal(status, 200);
    assert.equal(cache, "no-cache");
    assert.match(html, /<title>Shelly - Guessdle<\/title>/);
    assert.match(
      html,
      /<meta name="description" content="Guess the shell" \/>/,
    );
    assert.match(
      html,
      /<meta property="og:title" content="Shelly - Guessdle" \/>/,
    );
    assert.match(html, /<meta property="og:type" content="website" \/>/);
    assert.match(
      html,
      /<meta property="og:url" content="http:\/\/127\.0\.0\.1:\d+\/g\/shelly" \/>/,
    );
    assert.match(
      html,
      /<meta property="og:image" content="http:\/\/127\.0\.0\.1:\d+\/uploads\/c\.webp" \/>/,
    );
    assert.doesNotMatch(html, /noindex/);
    assert.match(html, /id="board"/);
  });

  it("omits og:image when the game has no cover", async () => {
    await makeGame("approved", 2);
    assert.doesNotMatch((await page(`/g/${SLUG}`)).html, /og:image/);
  });

  it("escapes game text so it cannot break out of the attribute", async () => {
    await makeGame("approved", 2, {
      name: `</title><script>alert(1)</script>`,
      description: `"><img src=x onerror=alert(1)> & more`,
    });
    const { html } = await page(`/g/${SLUG}`);
    assert.doesNotMatch(html, /<script>alert/);
    assert.doesNotMatch(html, /<img src=x/);
    assert.match(html, /&lt;\/title&gt;&lt;script&gt;/);
    assert.match(
      html,
      /&quot;&gt;&lt;img src=x onerror=alert\(1\)&gt; &amp; more/,
    );
  });

  it("marks a pending game noindex but still serves it", async () => {
    await makeGame("pending", 2);
    const { status, html } = await page(`/g/${SLUG}`);
    assert.equal(status, 200);
    assert.match(html, /<meta name="robots" content="noindex" \/>/);
  });

  it("answers 404 with noindex and no game text for a draft, an under-2 game and an unknown slug", async () => {
    await makeGame("draft", 2, { name: "SecretName" });
    for (const path of [`/g/${SLUG}`, "/g/no-such-game"]) {
      const { status, html, cache } = await page(path);
      assert.equal(status, 404);
      assert.equal(cache, "no-cache");
      assert.match(html, /<meta name="robots" content="noindex" \/>/);
      assert.doesNotMatch(html, /SecretName/);
      assert.doesNotMatch(html, /og:image/);
    }
    await db.pool.query("update games set status = 'approved'");
    await db.pool.query(
      "delete from entries where id = (select min(id) from entries where game_id = (select id from games where slug = $1))",
      [SLUG],
    );
    assert.equal((await page(`/g/${SLUG}`)).status, 404);
  });

  it("serves a draft to its owner and an admin as noindex, not to a stranger", async () => {
    const owner = await login("owner@example.com");
    await makeGame("draft", 0, {}, "owner@example.com");
    for (const cookie of [owner, await login("boss@example.com", true)]) {
      const res = await page(`/g/${SLUG}`, cookie);
      assert.equal(res.status, 200);
      assert.match(res.html, /noindex/);
    }
    const stranger = await page(`/g/${SLUG}`, await login("x@example.com"));
    assert.equal(stranger.status, 404);
  });

  it("does not take over the editor route", async () => {
    await makeGame("approved", 2);
    assert.equal((await fetch(`${url}/g/${SLUG}/edit`)).status, 404);
  });
});
