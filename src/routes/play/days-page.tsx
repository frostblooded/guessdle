// /g/:slug/days: every day of the game, newest first, to play or review. Signed-in progress comes
// from the server; an anonymous player's from the browser.
import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router";
import { EmptyState, PageHead } from "../../components/page.tsx";
import { Alert } from "../../components/ui/alert.tsx";
import { buttonVariants } from "../../components/ui/button.tsx";
import { statusOf, type DaysResponse } from "../../game/days.ts";
import {
  gameStorage,
  pastDayStorage,
  readProgress,
} from "../../game/game-state.ts";
import { gameKey, useMe } from "../../lib/api.ts";
import { useTitle } from "../../lib/use-title.ts";
import { DayList } from "./day-list.tsx";
import { GameNotFound } from "./past-day.tsx";
import { loadGame, loadJson } from "./load-game.ts";

// An anonymous player's statuses, read (never written) from the browser's Game State of each day
function withLocalStatuses(slug: string, list: DaysResponse): DaysResponse {
  const now = new Date();
  return {
    ...list,
    days: list.days.map((item) => {
      const today = item.day === list.today;
      const storage = today
        ? gameStorage(localStorage, slug)
        : pastDayStorage(localStorage, slug, item.day);
      const played = readProgress(storage, () => now, today);
      return { ...item, status: statusOf(played, list.tries) };
    }),
  };
}

export function DaysPage() {
  const { slug = "" } = useParams();
  const me = useMe();
  const game = useQuery({
    queryKey: gameKey(slug),
    // Fetched again on each visit, so a day that just rolled over links to the right page
    queryFn: () => loadGame(slug),
  });
  const days = useQuery({
    queryKey: ["days", slug, me.data?.email ?? null],
    queryFn: () =>
      loadJson<DaysResponse>(`/api/games/${encodeURIComponent(slug)}/days`),
    enabled: !me.isPending,
  });
  const name =
    typeof game.data === "object" && game.data !== null ? game.data.name : null;
  useTitle(
    days.data === "missing"
      ? "Game not found - Guessdle"
      : `${name ? `${name}: past days` : "Past days"} - Guessdle`,
  );

  if (days.data === "missing" || game.data === "missing") {
    return <GameNotFound />;
  }
  const list =
    typeof days.data === "object"
      ? me.data
        ? days.data
        : withLocalStatuses(slug, days.data)
      : null;
  return (
    <div className="mx-auto max-w-2xl">
      <PageHead
        titleId="game-title"
        title={name ?? "Past days"}
        lede={
          <p id="game-lede">
            Past days: pick one to play it or see your guesses.
          </p>
        }
        actions={
          <Link
            id="today-link"
            className={buttonVariants({ variant: "outline", size: "sm" })}
            to={`/g/${encodeURIComponent(slug)}`}
          >
            Play today&apos;s game
          </Link>
        }
      />
      {typeof days.data === "string" && (
        <Alert id="notice" variant="warn" role="status" className="mb-4">
          {days.data}
        </Alert>
      )}
      {(me.isPending || days.isPending) && (
        <EmptyState id="loading-state">Loading past days…</EmptyState>
      )}
      {list && <DayList slug={slug} today={list.today} days={list.days} />}
    </div>
  );
}
