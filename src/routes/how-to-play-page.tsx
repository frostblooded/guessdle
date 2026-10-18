import { useQuery } from "@tanstack/react-query";
import { PageHead } from "../components/page.tsx";
import { Alert } from "../components/ui/alert.tsx";
import { Card } from "../components/ui/card.tsx";
import type { Tutorial } from "../game/tutorial.ts";
import { getJson } from "../lib/api.ts";
import { useTitle } from "../lib/use-title.ts";
import { PracticeGame } from "./how-to-play/practice-game.tsx";

export function HowToPlayPage() {
  useTitle("How to play - Guessdle");
  const tutorial = useQuery({
    queryKey: ["tutorial"],
    queryFn: () => getJson<Tutorial>("/api/tutorial"),
    staleTime: Infinity,
  });
  return (
    <div className="mx-auto max-w-3xl">
      <PageHead
        title="How to play"
        lede="Never played a guessing game like this? Try a practice round with real pets. It takes a minute."
      />
      {tutorial.data ? (
        <PracticeGame tutorial={tutorial.data} />
      ) : tutorial.isError ? (
        <Alert id="practice-error" variant="error">
          The practice game could not load. Refresh the page to try again.
        </Alert>
      ) : (
        <p id="practice-loading" className="text-muted-foreground">
          Loading the practice game…
        </p>
      )}
      <Card id="help-blur" className="mt-4 p-5 sm:p-6">
        <h2 className="mb-2 text-lg font-semibold">Blur games</h2>
        <p className="text-muted-foreground">
          Some games show a picture instead of a table. The secret answer&apos;s
          image is split into nine squares, and only one of them is clear at
          first. Every wrong guess clears one more. The game says how many tries
          you have: miss on the last one and the day is over.
        </p>
      </Card>
    </div>
  );
}
