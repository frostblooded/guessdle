// The Past days list: every day from the game's start to today, with the
// signed-in player's progress on each.
import type pg from "pg";
import { statusOf, type DayItem } from "../game/days.ts";
import { dateOfDay } from "./answers.ts";
import type { GameRow } from "./games.ts";

type Q = Pick<pg.Pool, "query">;

// Days `today` down to 0. Victory is derived as in user-game.ts: a guess of the
// day's stored answer. Skips count as guesses.
export async function listDays(
  q: Q,
  game: GameRow,
  today: number,
  userId: number | null,
): Promise<DayItem[]> {
  const played = new Map<
    string,
    { won: boolean; gaveUp: boolean; guesses: number }
  >();
  if (userId !== null) {
    const guesses = await q.query<{
      date: string;
      guesses: number;
      won: boolean;
    }>(
      `select to_char(g.day, 'YYYY-MM-DD') as date, count(*)::int as guesses,
         bool_or(g.entry_id = a.entry_id) as won
       from (select day, game_id, entry_id from user_guesses where user_id = $1 and game_id = $2
             union all select day, game_id, null from user_skips where user_id = $1 and game_id = $2) g
       left join daily_answers a on a.game_id = g.game_id and a.day = g.day
       group by g.day`,
      [userId, game.id],
    );
    for (const row of guesses.rows) {
      played.set(row.date, {
        won: row.won === true,
        gaveUp: false,
        guesses: row.guesses,
      });
    }
    const gaveUp = await q.query<{ date: string }>(
      `select to_char(day, 'YYYY-MM-DD') as date from user_give_ups
       where user_id = $1 and game_id = $2`,
      [userId, game.id],
    );
    for (const { date } of gaveUp.rows) {
      const day = played.get(date) ?? { won: false, gaveUp: false, guesses: 0 };
      played.set(date, { ...day, gaveUp: true });
    }
  }
  const days: DayItem[] = [];
  for (let day = today; day >= 0; day--) {
    const date = dateOfDay(day, game.startDate);
    days.push({
      day,
      date,
      status: statusOf(
        played.get(date) ?? { won: false, gaveUp: false, guesses: 0 },
      ),
    });
  }
  return days;
}
