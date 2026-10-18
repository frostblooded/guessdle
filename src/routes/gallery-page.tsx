import { useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { Link } from "react-router";
import { EmptyState, PageHead } from "../components/page.tsx";
import { Alert } from "../components/ui/alert.tsx";
import { Badge } from "../components/ui/badge.tsx";
import { buttonVariants } from "../components/ui/button.tsx";
import { bannerOf, type Banner } from "../game/banner.ts";
import { cn } from "../lib/utils.ts";
import { useTitle } from "../lib/use-title.ts";

interface GameCard {
  slug: string;
  name: string;
  description: string;
  cover: string;
  photos: string[];
  entryCount: number;
  kind: "classic" | "zoom";
}

async function fetchGames(): Promise<GameCard[]> {
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

function Card({ card, featured }: { card: GameCard; featured: boolean }) {
  const banner = bannerOf(card.cover, card.photos);
  return (
    <li
      className={cn(
        "game-card",
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
          <h2 className="flex flex-wrap items-center gap-2 text-xl font-bold tracking-wide uppercase">
            {card.name}
            {featured && <Badge variant="default">Original</Badge>}
            {card.kind === "zoom" && <Badge variant="secondary">Zoom</Badge>}
          </h2>
          {card.description && (
            <p className="line-clamp-3 text-sm text-muted-foreground">
              {card.description}
            </p>
          )}
          <p className="fine-print mt-auto text-xs font-medium text-muted-foreground">
            {card.entryCount} entries
          </p>
        </div>
      </Link>
    </li>
  );
}

export function GalleryPage() {
  useTitle("Guessdle: daily guessing games");
  const games = useQuery({ queryKey: ["games"], queryFn: fetchGames });
  return (
    <>
      <PageHead
        centered
        title="Pick a game"
        lede={
          <>
            A new mystery every day in each game. New to this?{" "}
            <Link
              className="font-medium text-primary underline"
              to="/how-to-play"
            >
              How to play
            </Link>
          </>
        }
        actions={
          <Link
            id="create-link"
            className={buttonVariants({ className: "no-underline" })}
            to="/create"
          >
            <Plus aria-hidden="true" />
            Create a game
          </Link>
        }
      />
      {games.isError && (
        <Alert id="gallery-error" variant="warn" role="status">
          Could not load the games. Your connection may be down or the server
          may have a problem. Refresh the page; if it keeps failing, try again
          in a few minutes.
        </Alert>
      )}
      {games.isPending && (
        <EmptyState id="gallery-loading">Loading games…</EmptyState>
      )}
      <ul
        id="gallery"
        className="gallery grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
      >
        {games.data?.map((card, i) => (
          // The API lists the original game first
          <Card
            key={card.slug}
            card={card}
            featured={i === 0 && card.slug === "petdle"}
          />
        ))}
      </ul>
    </>
  );
}
