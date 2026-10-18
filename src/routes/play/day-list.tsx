// The Past days list: one row per day, newest first, each with how far the player got.
import { ChevronRight } from "lucide-react";
import { Link } from "react-router";
import { Badge } from "../../components/ui/badge.tsx";
import {
  dayLabel,
  dayPath,
  type DayItem,
  type DayStatus,
} from "../../game/days.ts";

const STATUS: Record<
  DayStatus,
  { text: string; variant: "success" | "warn" | "error" | "outline" }
> = {
  won: { text: "Won", variant: "success" },
  "gave-up": { text: "Gave up", variant: "error" },
  playing: { text: "In progress", variant: "warn" },
  unplayed: { text: "Not played", variant: "outline" },
};

export function DayList({
  slug,
  today,
  days,
}: {
  slug: string;
  today: number;
  days: readonly DayItem[];
}) {
  return (
    <ul id="day-list" className="day-list space-y-2">
      {days.map(({ day, date, status }) => (
        <li key={day}>
          <Link
            id={`day-${day}`}
            to={dayPath(slug, day, today)}
            className="day-row flex items-center gap-3 rounded-xl border bg-card px-4 py-3 no-underline shadow-sm transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <span className="flex min-w-0 flex-1 flex-col sm:flex-row sm:items-baseline sm:gap-3">
              <strong className="font-bold uppercase">
                {day === today ? "Today" : `Day ${day}`}
              </strong>
              <span className="text-sm text-muted-foreground">
                {dayLabel(date)}
              </span>
            </span>
            <Badge className="day-status" variant={STATUS[status].variant}>
              {STATUS[status].text}
            </Badge>
            <ChevronRight
              aria-hidden="true"
              className="size-4 shrink-0 text-muted-foreground"
            />
          </Link>
        </li>
      ))}
    </ul>
  );
}
