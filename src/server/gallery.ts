// The gallery: the games it shows, as cards, on the front page, profiles and playlists.
import type pg from "pg";
import { MAX_TILES } from "../game/banner.ts";
import type { GameKind } from "../game/blur.ts";
import { MIN_ENTRIES } from "../game/limits.ts";
import { HAS_MISSING_VALUES } from "./completeness.ts";
import { OWNER_BANNED } from "./users.ts";

type Q = Pick<pg.Pool, "query">;

// SQL true when the game aliased `g` is one the gallery shows: approved, with enough active
// entries (MIN_ENTRIES), none missing a value, and an owner not banned
export const IN_GALLERY = `(g.status = 'approved' and not ${HAS_MISSING_VALUES} and not ${OWNER_BANNED}
  and (select count(*) from entries n where n.game_id = g.id and n.deleted_at is null)
    >= ${MIN_ENTRIES})`;

export interface GalleryCard {
  slug: string;
  name: string;
  description: string;
  cover: string;
  // Banner collage photos of active entries, by id; only for a game without a cover. A Blur
  // game's photos are its answers, so it gets blurred tiles instead (`tileUrl`); a Sequence
  // game gets each entry's first photo, through the same tile route so its URL stays secret.
  photos: string[];
  entryCount: number;
  kind: GameKind;
}

// SQL for the first Image value of the entry aliased `alias` (null when it has none)
const FIRST_IMAGE = (alias: string): string =>
  `(select v.value from entry_values v join attributes a on a.id = v.attribute_id
     where v.entry_id = ${alias}.id and a.type = 'image' order by a.position, a.id limit 1)`;

// Which gallery games a list shows: all of them, one owner's, or one playlist's in its order
export type GalleryScope =
  | { ownerId: number; playlistId?: never }
  | { playlistId: number; ownerId?: never }
  | Record<string, never>;

// Approved games with enough active entries (MIN_ENTRIES) and none missing
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
         select x.photo from (
           select p.id, coalesce(nullif(p.photo_url, ''), ${FIRST_IMAGE("p")}, nullif(p.shots[1], '')) as photo
           from entries p where p.game_id = g.id and p.deleted_at is null) x
         where x.photo is not null order by x.id limit $2
       ) else '{}'::text[] end as photos,
       count(e.id)::int as "entryCount", g.kind
     from games g join entries e on e.game_id = g.id and e.deleted_at is null
     ${inPlaylist ? "join playlist_games pl on pl.game_id = g.id and pl.playlist_id = $3" : ""}
     where g.status = 'approved' and not ${HAS_MISSING_VALUES} and not ${OWNER_BANNED}
       ${scope.ownerId !== undefined ? "and g.owner_id = $3" : ""}
     group by g.id${inPlaylist ? ", pl.position" : ""} having count(e.id) >= $1
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
    card.kind === "blur" || card.kind === "sequence"
      ? {
          ...card,
          photos: card.photos.map((_, i) => tileUrl(card.slug, i)),
        }
      : card,
  );
}

// Tile n of a Blur or Sequence game's banner collage: its nth entry photo with a photo, blurred
// for Blur (ADR 0019), the first of its photos for Sequence
export const tileUrl = (slug: string, n: number): string =>
  `/api/games/${encodeURIComponent(slug)}/tile/${n}`;
