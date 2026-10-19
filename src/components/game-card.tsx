// A game in a grid of games: the gallery, a profile and a playlist all draw it the same way.
import type { ComponentProps, ReactNode } from "react";
import { Link } from "react-router";
import type { GameKind } from "../game/blur.ts";
import { bannerOf, type Banner } from "../game/banner.ts";
import { cn } from "../lib/utils.ts";
import { GameKindLabel } from "./game-kind.tsx";
import { Badge } from "./ui/badge.tsx";

// One game as GET /api/games lists it
export interface GameCard {
  slug: string;
  name: string;
  description: string;
  cover: string;
  photos: string[];
  entryCount: number;
  kind: GameKind;
}

// The gallery: GET /api/games
export async function fetchGallery(): Promise<GameCard[]> {
  const res = await fetch("/api/games");
  if (!res.ok) {
    throw new Error(String(res.status));
  }
  return (await res.json()) as GameCard[];
}

// One image for a cover, a grid of decorative tiles for a collage
function BannerImage({
  banner,
  className,
}: {
  banner: NonNullable<Banner>;
  className: string;
}) {
  if (banner.kind === "cover") {
    return (
      <img
        className={cn(
          "game-banner aspect-[2/1] w-full object-cover",
          className,
        )}
        src={banner.url}
        alt=""
        loading="lazy"
      />
    );
  }
  return (
    <div
      className={cn(
        "game-banner game-banner-collage grid aspect-[2/1] w-full gap-0.5 bg-border",
        className,
      )}
      style={{
        gridTemplateColumns: `repeat(${banner.columns}, minmax(0, 1fr))`,
      }}
    >
      {banner.tiles.map((src, i) => (
        <img
          key={i}
          className="size-full object-cover"
          src={src}
          alt=""
          loading="lazy"
        />
      ))}
    </div>
  );
}

// `corner` sits over the card's top right, outside its link (a Save button)
export function GameCardItem({
  card,
  featured = false,
  corner,
}: {
  card: GameCard;
  featured?: boolean;
  corner?: ReactNode;
}) {
  const banner = bannerOf(card.cover, card.photos);
  return (
    <li
      className={cn(
        "game-card relative",
        featured && "game-card-featured sm:col-span-2 lg:col-span-3",
      )}
    >
      <Link
        to={`/g/${encodeURIComponent(card.slug)}`}
        className={cn(
          "group flex h-full flex-col overflow-hidden rounded-lg border-2 border-tile bg-card text-card-foreground no-underline transition-colors hover:bg-secondary",
          featured && "lg:flex-row",
        )}
      >
        {banner && (
          <BannerImage banner={banner} className={cn(featured && "lg:w-1/2")} />
        )}
        <div
          className={cn(
            "game-card-body flex flex-1 flex-col gap-2 p-5",
            featured && "lg:justify-center lg:p-8",
          )}
        >
          <h2
            className={cn(
              "flex flex-wrap items-center gap-2 text-xl font-bold tracking-wide uppercase",
              corner !== undefined && !banner && "pr-10",
            )}
          >
            {card.name}
            {featured && <Badge variant="default">Original</Badge>}
          </h2>
          {card.description && (
            <p className="line-clamp-3 text-sm text-muted-foreground">
              {card.description}
            </p>
          )}
          <p className="fine-print mt-auto flex flex-wrap items-center gap-x-1.5 text-xs font-medium text-muted-foreground">
            <GameKindLabel kind={card.kind} />
            <span aria-hidden="true">·</span>
            <span>
              {card.entryCount} {card.kind === "quiz" ? "questions" : "entries"}
            </span>
          </p>
        </div>
      </Link>
      {corner !== undefined && (
        <div className="absolute top-2 right-2 z-10">{corner}</div>
      )}
    </li>
  );
}

// A grid of game cards
export function GameGrid({
  className,
  children,
  ...props
}: ComponentProps<"ul">) {
  return (
    <ul
      className={cn("grid gap-4 sm:grid-cols-2 lg:grid-cols-3", className)}
      {...props}
    >
      {children}
    </ul>
  );
}
