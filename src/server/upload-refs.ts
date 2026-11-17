import { readdir, stat, unlink } from "node:fs/promises";
import { join } from "node:path";
import type pg from "pg";
import type { GameRow } from "./games.ts";

export const SWEEP_GRACE_MS = 24 * 3600 * 1000;
const URL_RE = /^\/uploads\/([0-9a-f]{32}\.webp)$/;

const unlinkQuiet = (path: string): Promise<void> =>
  unlink(path).catch((e: NodeJS.ErrnoException) => {
    if (e.code !== "ENOENT") {
      throw e;
    }
  });

type MaybeUrl = string | null | undefined;

const IMAGE_VALUES = `select v.value as url, e.game_id from entry_values v
  join attributes a on a.id = v.attribute_id join entries e on e.id = v.entry_id
  where a.type = 'image'`;

export function uploadRefs(pool: pg.Pool, dir: string) {
  const isReferenced = async (url: string): Promise<boolean> =>
    (
      await pool.query(
        `select 1 from games where cover_url = $1
         union all select 1 from entries where photo_url = $1 or $1 = any(shots)
         union all select 1 from (${IMAGE_VALUES}) i where i.url = $1
         union all select 1 from tutorial_photos where url = $1`,
        [url],
      )
    ).rowCount! > 0;

  const referencedUrls = async (): Promise<Set<string>> => {
    const { rows } = await pool.query<{ url: string }>(
      `select cover_url as url from games union select photo_url from entries
       union select unnest(shots) from entries
       union select url from (${IMAGE_VALUES}) i union select url from tutorial_photos`,
    );
    return new Set(rows.map((r) => r.url));
  };

  const release = async (urls: Iterable<MaybeUrl>): Promise<void> => {
    for (const url of new Set(urls)) {
      const name = URL_RE.exec(url ?? "")?.[1];
      if (name && !(await isReferenced(url!))) {
        await unlinkQuiet(join(dir, name));
        await pool.query("delete from uploads where name = $1", [name]);
      }
    }
  };

  const mayAttach = async (
    url: string,
    current: string,
    actorId: number,
    ownerId: number | null,
  ): Promise<boolean> => {
    const name = URL_RE.exec(url)?.[1];
    return (
      url === "" ||
      url === current ||
      (name !== undefined &&
        (
          await pool.query(
            "select 1 from uploads where name = $1 and user_id = any($2)",
            [name, [actorId, ownerId].filter((o) => o !== null)],
          )
        ).rowCount === 1)
    );
  };

  return {
    release,
    mayAttach,

    async dropGame(game: GameRow): Promise<void> {
      const { rows } = await pool.query<{ url: string }>(
        `select photo_url as url from entries where game_id = $1
         union select unnest(shots) from entries where game_id = $1
         union select url from (${IMAGE_VALUES}) i where i.game_id = $1`,
        [game.id],
      );
      await pool.query("delete from games where id = $1", [game.id]);
      await release([...rows.map((r) => r.url), game.coverUrl]);
    },

    async dropUser(userId: number): Promise<boolean> {
      const { rows } = await pool.query<{ url: string }>(
        `select '/uploads/' || name as url from uploads where user_id = $1
         union select cover_url from games where owner_id = $1
         union select e.photo_url from entries e join games g on g.id = e.game_id where g.owner_id = $1
         union select unnest(e.shots) from entries e join games g on g.id = e.game_id where g.owner_id = $1
         union select i.url from (${IMAGE_VALUES}) i join games g on g.id = i.game_id where g.owner_id = $1`,
        [userId],
      );
      const { rowCount } = await pool.query("delete from users where id = $1", [
        userId,
      ]);
      await release(rowCount === 1 ? rows.map((r) => r.url) : []);
      return rowCount === 1;
    },

    async sweep(now: Date): Promise<string[]> {
      const keep = await referencedUrls();
      const names = await readdir(dir).catch(() => [] as string[]);
      const removed: string[] = [];
      for (const name of names) {
        const url = `/uploads/${name}`;
        if (!URL_RE.test(url) || keep.has(url)) {
          continue;
        }
        const { mtimeMs } = await stat(join(dir, name));
        if (now.getTime() - mtimeMs >= SWEEP_GRACE_MS) {
          await release([url]);
          removed.push(name);
        }
      }
      await pool.query(
        "delete from uploads where created_at < $1 and not (name = any($2))",
        [new Date(now.getTime() - SWEEP_GRACE_MS), names],
      );
      return removed;
    },
  };
}

export type UploadRefs = ReturnType<typeof uploadRefs>;
