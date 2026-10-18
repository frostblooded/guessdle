import assert from "node:assert/strict";
import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";
import { findGame } from "../../src/server/games.ts";
import { MIGRATIONS_DIR } from "../../src/server/main.ts";
import { migrate } from "../../src/server/migrate.ts";
import { uploadRefs } from "../../src/server/upload-refs.ts";
import { deleteUser } from "../../src/server/users.ts";
import { startDb } from "./postgres.ts";
import type { TestDb } from "./postgres.ts";

describe("upload references", () => {
  let db: TestDb;
  let dir: string;
  let refs: ReturnType<typeof uploadRefs>;
  let n = 0;

  beforeAll(async () => {
    db = await startDb();
    await migrate(db.pool, MIGRATIONS_DIR);
    dir = await mkdtemp(join(tmpdir(), "refs-"));
    refs = uploadRefs(db.pool, dir);
  });
  afterAll(async () => {
    await db.stop();
    await rm(dir, { recursive: true, force: true });
  });
  beforeEach(async () => {
    await db.pool.query("delete from games");
    await db.pool.query("delete from users");
    await db.pool.query("delete from uploads");
    for (const f of await readdir(dir)) {
      await rm(join(dir, f));
    }
  });

  const user = async (email: string): Promise<number> =>
    (
      await db.pool.query<{ id: number }>(
        "insert into users (email, name) values ($1, $1) returning id::int",
        [email],
      )
    ).rows[0]!.id;
  // A stored file with its quota row
  const file = async (owner: number): Promise<string> => {
    const name = `${(++n).toString(16).padStart(32, "0")}.webp`;
    await writeFile(join(dir, name), "x");
    await db.pool.query(
      "insert into uploads (name, user_id, bytes, created_at) values ($1, $2, 1, now())",
      [name, owner],
    );
    return `/uploads/${name}`;
  };
  const game = async (slug: string, owner: number, cover: string) => (
    await db.pool.query(
      "insert into games (slug, name, start_date, cover_url, owner_id) values ($1, $1, '2026-10-16', $2, $3)",
      [slug, cover, owner],
    ),
    (await findGame(db.pool, slug))!
  );
  // An entry using `photo` as its photo (as a Blur entry does), or with `image` as an Image value
  const entry = async (
    slug: string,
    photo: string,
    deleted = false,
    image = false,
  ): Promise<void> => {
    const { rows } = await db.pool.query<{ id: number }>(
      `insert into entries (game_id, name, photo_url, deleted_at)
       select id, $2, $3, case when $4 then now() end from games where slug = $1
       returning id::int`,
      [slug, photo, image ? "" : photo, deleted],
    );
    if (image) {
      await db.pool.query(
        `with a as (
           insert into attributes (game_id, name, type, position)
           select id, $2, 'image', 0 from games where slug = $1 returning id)
         insert into entry_values (entry_id, attribute_id, position, value)
         select $3, a.id, 0, $2 from a`,
        [slug, photo, rows[0]!.id],
      );
    }
  };
  const left = async (): Promise<string[]> => (await readdir(dir)).sort();
  const rows = async (): Promise<number> =>
    (await db.pool.query("select 1 from uploads")).rowCount!;

  it("mayAttach: clear, keep current, the actor's file or the owner's file, nobody else's", async () => {
    const [actor, owner, other] = [
      await user("a@x.test"),
      await user("o@x.test"),
      await user("z@x.test"),
    ];
    const [mine, theirs, foreign] = [
      await file(actor),
      await file(owner),
      await file(other),
    ];
    const ok = (url: string, current = "", ownerId: number | null = owner) =>
      refs.mayAttach(url, current, actor, ownerId);
    assert.equal(await ok(""), true);
    assert.equal(await ok(foreign, foreign), true);
    assert.equal(await ok(mine), true);
    assert.equal(await ok(theirs), true);
    assert.equal(await ok(theirs, "", null), false);
    assert.equal(await ok(foreign), false);
    assert.equal(await ok(`/uploads/${"f".repeat(32)}.webp`), false);
    assert.equal(await ok("/uploads/../../etc/passwd"), false);
  });

  it("a replaced cover, a dropped game and a dropped user share one reference rule", async () => {
    const owner = await user("o@x.test");
    const admin = await user("adm@x.test");
    const shared = await file(owner);
    // g1 and g2 both use `shared`; each also has a private cover and picture (g1's as Image
    // values, g2's as photos)
    const [c1, p1, c2, p2] = [
      await file(owner),
      await file(owner),
      await file(owner),
      await file(owner),
    ];
    const g1 = await game("one", owner, c1);
    await game("two", owner, c2);
    await entry("one", shared, false, true);
    await entry("one", p1, false, true);
    await entry("two", shared);
    await entry("two", p2, true);

    // Replacing a cover releases the old one, but never a file another game uses
    await db.pool.query("update games set cover_url = '' where slug = 'one'");
    await refs.release([c1, shared]);
    assert.equal((await left()).includes(c1.slice(9)), false);
    assert.equal((await left()).includes(shared.slice(9)), true);

    // Dropping game one frees its photo, keeps the shared file
    await refs.dropGame(g1);
    assert.equal(await findGame(db.pool, "one"), null);
    assert.deepEqual(
      await left(),
      [shared, c2, p2].map((u) => u.slice(9)).sort(),
    );

    // Dropping the owner frees everything left, soft-deleted photos included
    assert.equal(await deleteUser(refs, admin, owner), "ok");
    assert.deepEqual(await left(), []);
    assert.equal(await rows(), 0);
  });

  it("deleteUser refuses self and unknown users and keeps their files", async () => {
    const me = await user("me@x.test");
    const mine = await file(me);
    assert.equal(await deleteUser(refs, me, me), "self_deletion");
    assert.equal(await deleteUser(refs, me, me + 999), "not_found");
    assert.deepEqual(await left(), [mine.slice(9)]);
  });
});
