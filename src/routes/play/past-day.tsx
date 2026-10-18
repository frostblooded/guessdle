// Play's pieces for past days: the head's Past days link, an archive day's lede, and the card
// for a day the game does not have.
import { Link } from "react-router";
import { MessageCard, PageHead } from "../../components/page.tsx";
import { buttonVariants } from "../../components/ui/button.tsx";
import { dateOfDay } from "../../game/date.ts";
import { dayLabel } from "../../game/days.ts";
import { FAILURES } from "../../game/failures.ts";

// The head's link to the Past days list
export function PastDaysLink({ slug }: { slug: string }) {
  return (
    <Link
      id="past-days-link"
      className={buttonVariants({ variant: "outline", size: "sm" })}
      to={`/g/${encodeURIComponent(slug)}/days`}
    >
      Past days
    </Link>
  );
}

// Under an archive day's title: which day it is, and the way back to today
export function PastDayLede({
  slug,
  day,
  startDate,
}: {
  slug: string;
  day: number;
  startDate: string;
}) {
  return (
    <p id="game-lede">
      Day {day}, {dayLabel(dateOfDay(day, startDate))}.{" "}
      <Link
        id="today-link"
        className="underline underline-offset-4"
        to={`/g/${encodeURIComponent(slug)}`}
      >
        Play today&apos;s game
      </Link>
    </p>
  );
}

// A day after today, or not a day at all
export function NoSuchDay({ slug, name }: { slug: string; name: string }) {
  return (
    <>
      <PageHead
        titleId="game-title"
        title={name}
        lede={<p id="game-lede">{FAILURES.no_such_day.text}</p>}
      />
      <MessageCard id="no-such-day">
        <PastDaysLink slug={slug} />
      </MessageCard>
    </>
  );
}
