// /g/:slug/days: every day of the game, newest first, to play or review. Signed-in progress comes
// from the server; an anonymous player's from the browser.
import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router";
import { EmptyState, PageHead } from "../../components/page.tsx";
import { Alert } from "../../components/ui/alert.tsx";
import { buttonVariants } from "../../components/ui/button.tsx";
import { localStatus, type DaysResponse } from "../../game/days.ts";
import { failureText, UNREACHABLE } from "../../game/failures.ts";
import {
  createGameState,
  gameStorage,
  pastDayStorage,
} from "../../game/game-state.ts";
import { gameKey, useMe } from "../../lib/api.ts";
import { useTitle } from "../../lib/use-title.ts";
import { DayList } from "./day-list.tsx";
import { GameNotFound } from "./past-day.tsx";
import { loadGame } from "./play-page.tsx";

// The list, "missing" for no such game, or the text of why it could not be loaded
async function loadDays(
  slug: string,
): Promise<DaysResponse | "missing" | string> {
  try {
    const res = await fetch(`/api/games/${encodeURIComponent(slug)}/days`);
    if (res.status === 404) {
      return "missing";
    }
    const data = (await res.json().catch(() => null)) as unknown;
    return res.ok
      ? (data as DaysResponse)
      : failureText((data as { error?: unknown } | null)?.error, res.status);
  } catch {
    return UNREACHABLE;
  }
}

// An anonymous player's statuses, read from the browser's Game State of each day
function withLocalStatuses(slug: string, list: DaysResponse): DaysResponse {
  const now = new Date();
  return {
    ...list,
    days: list.days.map((item) => {
      const storage =
        item.day === list.today
          ? gameStorage(localStorage, slug)
          : pastDayStorage(localStorage, slug, item.day);
      const state = createGameState(
        storage,
        () => now,
        item.day === list.today,
      );
      return { ...item, status: localStatus(state) };
    }),
  };
}

export function DaysPage() {
  const { slug = "" } = useParams();
  const me = useMe();
  const game = useQuery({
    queryKey: gameKey(slug),
    queryFn: () => loadGame(slug),
    staleTime: Infinity,
  });
  const days = useQuery({
    queryKey: ["days", slug, me.data?.email ?? null],
    queryFn: () => loadDays(slug),
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
