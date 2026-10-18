import { useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { Link } from "react-router";
import {
  fetchGallery,
  GameCardItem,
  GameGrid,
} from "../components/game-card.tsx";
import { SaveButton } from "../components/save-to-playlist.tsx";
import { EmptyState, PageHead } from "../components/page.tsx";
import { Alert } from "../components/ui/alert.tsx";
import { buttonVariants } from "../components/ui/button.tsx";
import { useTitle } from "../lib/use-title.ts";

export function GalleryPage() {
  useTitle("Guessdle: daily guessing games");
  const games = useQuery({ queryKey: ["games"], queryFn: fetchGallery });
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
      <GameGrid id="gallery" className="gallery">
        {games.data?.map((card, i) => (
          // The API lists the original game first
          <GameCardItem
            key={card.slug}
            card={card}
            featured={i === 0 && card.slug === "petdle"}
            corner={<SaveButton slug={card.slug} name={card.name} compact />}
          />
        ))}
      </GameGrid>
    </>
  );
}
