import assert from "node:assert/strict";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, afterEach, beforeAll, describe, it } from "vitest";
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

  beforeAll(async () => {
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
  afterAll(async () => {
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
    assert.match(html, /id="root"/);
    // The site-wide description gives way to the game's
    assert.equal(html.match(/name="description"/g)?.length, 1);
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

  it("answers 404 for an encoded percent sign in the slug (no double decode)", async () => {
    for (const path of ["/g/%25zz", "/g/%25", "/g/%25E0%25A4%25A"]) {
      const { status, html } = await page(path);
      assert.equal(status, 404, path);
      assert.match(html, /Game not found/);
    }
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

  it("agrees with the API on who sees a game, for every status, entry count and role", async () => {
    const cookies = {
      anon: undefined,
      stranger: await login("stranger@example.com"),
      owner: await login("owner@example.com"),
      admin: await login("boss@example.com", true),
    };
    const get = async (path: string, who: keyof typeof cookies) =>
      (
        await fetch(`${url}${path}`, {
          headers: cookies[who] ? { Cookie: cookies[who] } : {},
        })
      ).status;
    for (const status of ["draft", "pending", "approved", "rejected"]) {
      for (const entries of [0, 1, 2]) {
        await db.pool.query("delete from games where slug = $1", [SLUG]);
        await makeGame(status, entries, {}, "owner@example.com");
        const playable = status !== "draft" && entries >= 2;
        for (const who of ["anon", "stranger", "owner", "admin"] as const) {
          const manager = who === "owner" || who === "admin";
          const tag = `${status}/${entries}/${who}`;
          const visible = playable || manager ? 200 : 404;
          assert.equal(await get(`/g/${SLUG}`, who), visible, tag);
          assert.equal(await get(`/api/games/${SLUG}`, who), visible, tag);
          // Editing routes hide first (404), then ask for a sign-in, then refuse
          const edit =
            visible === 404 ? 404 : manager ? 200 : who === "anon" ? 401 : 403;
          for (const path of ["details", "answers"]) {
            assert.equal(
              await get(`/api/games/${SLUG}/${path}`, who),
              edit,
              tag + path,
            );
          }
        }
      }
    }
  });
});
