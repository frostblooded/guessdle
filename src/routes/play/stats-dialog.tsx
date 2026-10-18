// The victory popup: congratulations, the player's guesses and time, and how the day's winners did.
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "../../components/ui/dialog.tsx";
import {
  formatSeconds,
  guessBar,
  MAX_GUESS_BAR,
  TIME_BUCKETS,
  timeBucket,
  type DayStats,
} from "../../game/stats.ts";

export interface Bar {
  label: string;
  count: number;
  mine: boolean;
}

// Horizontal bars, one per bucket, the player's own in the correct-tile green
export function BarChart({
  id,
  title,
  bars,
}: {
  id: string;
  title: string;
  bars: readonly Bar[];
}) {
  const max = Math.max(1, ...bars.map((bar) => bar.count));
  return (
    <figure id={id} className="flex flex-col gap-2">
      <figcaption className="text-sm font-bold uppercase">{title}</figcaption>
      <ol className="flex flex-col gap-0.5">
        {bars.map((bar) => (
          <li
            key={bar.label}
            className="stats-bar flex items-center gap-2 text-sm"
            data-mine={bar.mine || undefined}
            aria-label={`${bar.label}: ${players(bar.count)}${bar.mine ? ", you" : ""}`}
          >
            <span className="w-14 shrink-0 text-right tabular-nums">
              {bar.label}
            </span>
            <span className="flex min-w-0 flex-1 items-center gap-1.5">
              <span
                className={`h-5 rounded-r-sm ${bar.mine ? "bg-correct" : "bg-input"}`}
                style={{
                  // The longest bar leaves room for its count and "(you)"
                  width: `calc((100% - 4.5rem) * ${bar.count / max})`,
                  minWidth: bar.count > 0 ? "4px" : 0,
                }}
              />
              <span
                className={`shrink-0 tabular-nums ${bar.mine ? "font-bold" : "text-muted-foreground"}`}
              >
                {bar.count}
                {bar.mine && " (you)"}
              </span>
            </span>
          </li>
        ))}
      </ol>
    </figure>
  );
}

const players = (n: number): string => `${n} ${n === 1 ? "player" : "players"}`;
const guessesWord = (n: number): string =>
  `${n} ${n === 1 ? "guess" : "guesses"}`;

const MIN_GUESS_BARS = 6;

export function guessBars(stats: DayStats): Bar[] {
  const mine = stats.you === null ? -1 : guessBar(stats.you.guesses);
  // Empty bars past the longest win go, keeping at least MIN_GUESS_BARS
  const last = Math.max(
    MIN_GUESS_BARS - 1,
    mine,
    ...stats.guesses.map((count, i) => (count > 0 ? i : -1)),
  );
  return stats.guesses.slice(0, last + 1).map((count, i) => ({
    label: i === MAX_GUESS_BAR - 1 ? `${MAX_GUESS_BAR}+` : String(i + 1),
    count,
    mine: i === mine,
  }));
}

export function timeBars(stats: DayStats): Bar[] {
  const seconds = stats.you?.seconds ?? null;
  const mine = seconds === null ? -1 : timeBucket(seconds);
  return TIME_BUCKETS.map((bucket, i) => ({
    label: bucket.label,
    count: stats.times[i] ?? 0,
    mine: i === mine,
  }));
}

// What the popup says under the title about how the player compares
function comparison(percent: number | null, better: string): string | null {
  return percent === null ? null : `${better} than ${percent}% of players`;
}

// `past`: the stats of a past day (anyone who won it, then or later), not today
export function StatsPanel({
  stats,
  past = false,
}: {
  stats: DayStats;
  past?: boolean;
}) {
  const when = past ? "" : " today";
  const { you } = stats;
  const others = stats.players - (you === null ? 0 : 1);
  const hasTimes = stats.times.some((n) => n > 0);
  return (
    <div className="flex flex-col gap-5">
      {stats.firstTryFailed && (
        <p
          id="stats-not-counted"
          className="rounded-lg bg-warn-bg p-3 text-sm text-warn"
        >
          Only the first try counts, and your first try{when} ended without a
          win, so this one is not in the stats.
        </p>
      )}
      {you && (
        <dl className="grid grid-cols-2 gap-3 text-center">
          <div className="rounded-lg bg-muted p-3">
            <dt className="text-xs font-bold uppercase">Guesses</dt>
            <dd id="stats-guesses" className="text-3xl font-bold tabular-nums">
              {you.guesses}
            </dd>
            <dd className="text-xs text-muted-foreground">
              {comparison(stats.fewerGuessesThan, "Fewer guesses") ?? " "}
            </dd>
          </div>
          <div className="rounded-lg bg-muted p-3">
            <dt className="text-xs font-bold uppercase">Time</dt>
            <dd id="stats-time" className="text-3xl font-bold tabular-nums">
              {you.seconds === null ? "-" : formatSeconds(you.seconds)}
            </dd>
            <dd className="text-xs text-muted-foreground">
              {comparison(stats.fasterThan, "Faster") ?? " "}
            </dd>
          </div>
        </dl>
      )}
      <p id="stats-players" className="text-center text-sm">
        {stats.players === 0
          ? `Nobody has solved it${when} yet.`
          : others === 0 && you
            ? `You are the first to solve it${when}.`
            : `${players(stats.players)} solved it${when}.`}
      </p>
      <BarChart
        id="stats-guess-chart"
        title="Guesses"
        bars={guessBars(stats)}
      />
      {hasTimes && (
        <BarChart id="stats-time-chart" title="Time" bars={timeBars(stats)} />
      )}
    </div>
  );
}

// The popup itself; `stats` is null while loading or when the server could not answer
export function StatsDialog({
  open,
  onOpenChange,
  answer,
  stats,
  failed,
  returnFocusId,
  past = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  answer: string;
  stats: DayStats | null;
  failed: boolean;
  // Gets focus back on close: the popup may have opened on its own, from a guess box that is gone
  returnFocusId: string;
  past?: boolean;
}) {
  const which = past ? "this day's" : "today's";
  const you = stats?.you;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        id="stats-dialog"
        onCloseAutoFocus={(event) => {
          const target = document.getElementById(returnFocusId);
          if (target) {
            event.preventDefault();
            target.focus();
          }
        }}
      >
        <div className="flex flex-col gap-1 pr-8">
          <DialogTitle className="text-success">Congratulations!</DialogTitle>
          <DialogDescription className="text-base text-foreground">
            You found <span className="font-semibold">{answer}</span>
            {you ? ` in ${guessesWord(you.guesses)}.` : "."}
          </DialogDescription>
        </div>
        {stats ? (
          <StatsPanel stats={stats} past={past} />
        ) : (
          <p id="stats-status" className="text-sm text-muted-foreground">
            {failed
              ? `Could not load ${which} stats. Try again in a moment.`
              : `Loading ${which} stats…`}
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
