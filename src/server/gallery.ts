// The front-page gallery and the lists built on it (an owner's games, a playlist).
import type pg from "pg";
import { MAX_TILES } from "../game/banner.ts";
import type { GameKind } from "../game/blur.ts";
import { MIN_ENTRIES } from "../game/limits.ts";
import { HAS_MISSING_VALUES } from "./completeness.ts";

type Q = Pick<pg.Pool, "query">;

// SQL true when the game aliased `g` is one the gallery shows: approved, with enough active
// entries (one for a Blur game, MIN_ENTRIES otherwise) and none missing a value
export const IN_GALLERY = `(g.status = 'approved' and not ${HAS_MISSING_VALUES}
  and (select count(*) from entries n where n.game_id = g.id and n.deleted_at is null)
    >= case when g.kind = 'blur' then 1 else ${MIN_ENTRIES} end)`;

export interface GalleryCard {
  slug: string;
  name: string;
  description: string;
  cover: string;
  // Banner collage photos of active entries, by id; only for a game without a cover. A Blur
  // game's photos are its answers, so it gets blurred tiles instead (`blurTileUrl`); a Sequence
  // game gets none.
  photos: string[];
  entryCount: number;
  kind: GameKind;
}

// Which gallery games a list shows: all of them, one owner's, or one playlist's in its order
export type GalleryScope =
  | { ownerId: number; playlistId?: never }
  | { playlistId: number; ownerId?: never }
  | Record<string, never>;

// Approved games with enough active entries (MIN_ENTRIES, one for a Blur game) and none missing
// a value: the original first, then newest first. A scope narrows them to an owner's (newest first) or a playlist's.
export async function listGallery(
  q: Q,
  scope: GalleryScope = {},
): Promise<GalleryCard[]> {
  const inPlaylist = scope.playlistId !== undefined;
  const narrowedBy = [scope.playlistId ?? scope.ownerId].filter(
    (id) => id !== undefined,
  );
  const { rows } = await q.query<GalleryCard>(
    `select g.slug, g.name, g.description, g.cover_url as cover,
       case when g.cover_url = '' then array(
         select p.photo_url from entries p
         where p.game_id = g.id and p.deleted_at is null and p.photo_url <> ''
         order by p.id limit $2
       ) else '{}'::text[] end as photos,
       count(e.id)::int as "entryCount", g.kind
     from games g join entries e on e.game_id = g.id and e.deleted_at is null
     ${inPlaylist ? "join playlist_games pl on pl.game_id = g.id and pl.playlist_id = $3" : ""}
     where g.status = 'approved' and not ${HAS_MISSING_VALUES}
       ${scope.ownerId !== undefined ? "and g.owner_id = $3" : ""}
     group by g.id${inPlaylist ? ", pl.position" : ""} having count(e.id) >= case when g.kind = 'blur' then 1 else $1 end
     order by ${
       inPlaylist
         ? "pl.position"
         : scope.ownerId !== undefined
           ? "g.created_at desc, g.id desc"
           : "g.slug = 'petdle' desc, g.created_at desc, g.id desc"
     }`,
    [MIN_ENTRIES, MAX_TILES, ...narrowedBy],
  );
  return rows.map((card) =>
    card.kind === "blur"
      ? {
          ...card,
          photos: card.photos.map((_, i) => blurTileUrl(card.slug, i)),
        }
      : card,
  );
}

// Tile n of a Blur game's banner collage: its nth entry photo with a photo, blurred (ADR 0019)
export const blurTileUrl = (slug: string, n: number): string =>
  `/api/games/${encodeURIComponent(slug)}/tile/${n}`;
