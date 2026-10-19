// Friends: requests by exact username or email, accepting, removing, and the friends'
// first tries shown on the result screens.
import type pg from "pg";
import type {
  Friend,
  FriendList,
  FriendRequestOutcome,
  FriendResult,
  QuizFriendResult,
} from "../game/friends.ts";
import type { MailConfig } from "./mailer.ts";

type Q = Pick<pg.Pool, "query">;

// SQL: the user ids that are friends of the user id in `$n`, with their shown name
const friendsOf = (n: number): string =>
  `select u.id, coalesce(u.username, u.email) as name, u.banned_at from friendships f
   join users u on u.id = case when f.requester_id = $${n} then f.addressee_id else f.requester_id end
   where f.accepted_at is not null and $${n} in (f.requester_id, f.addressee_id)`;

// The player a friend request names: an exact username, or an exact email (any case)
export async function findPlayer(
  q: Q,
  query: string,
): Promise<{ id: number; banned: boolean } | null> {
  const { rows } = await q.query<{ id: number; banned: boolean }>(
    `select id::int, banned_at is not null as banned from users
     where ${query.includes("@") ? "lower(email)" : "username"} = lower($1)`,
    [query.trim()],
  );
  return rows[0] ?? null;
}

export async function listFriends(q: Q, userId: number): Promise<FriendList> {
  const named = (rows: (Friend & { accepted: boolean; mine: boolean })[]) =>
    rows.map(({ id, name }) => ({ id, name }));
  const { rows } = await q.query<Friend & { accepted: boolean; mine: boolean }>(
    `select u.id::int, coalesce(u.username, u.email) as name,
       f.accepted_at is not null as accepted, f.requester_id = $1 as mine
     from friendships f
     join users u on u.id = case when f.requester_id = $1 then f.addressee_id else f.requester_id end
     where $1 in (f.requester_id, f.addressee_id)
     order by lower(coalesce(u.username, u.email))`,
    [userId],
  );
  return {
    friends: named(rows.filter((r) => r.accepted)),
    incoming: named(rows.filter((r) => !r.accepted && !r.mine)),
    outgoing: named(rows.filter((r) => !r.accepted && r.mine)),
  };
}

// Requests waiting for this player's answer: the account menu's badge
export async function incomingCount(q: Q, userId: number): Promise<number> {
  const { rows } = await q.query<{ n: number }>(
    "select count(*)::int as n from friendships where addressee_id = $1 and accepted_at is null",
    [userId],
  );
  return rows[0]!.n;
}

// A request from `from` to `to`; when `to` had already asked `from`, that request is accepted
// instead. "exists" when they are friends or `from` already asked.
export async function sendRequest(
  q: Q,
  from: number,
  to: number,
  now: Date,
): Promise<FriendRequestOutcome | "exists"> {
  const accepted = await q.query(
    `update friendships set accepted_at = $3
     where requester_id = $2 and addressee_id = $1 and accepted_at is null`,
    [from, to, now],
  );
  if (accepted.rowCount) {
    return "accepted";
  }
  const sent = await q.query(
    `insert into friendships (requester_id, addressee_id, created_at)
     values ($1, $2, $3) on conflict do nothing`,
    [from, to, now],
  );
  return sent.rowCount ? "sent" : "exists";
}

// Accepts `other`'s request to `userId`; false when there is none
export async function acceptRequest(
  q: Q,
  userId: number,
  other: number,
  now: Date,
): Promise<boolean> {
  const out = await q.query(
    `update friendships set accepted_at = $3
     where requester_id = $2 and addressee_id = $1 and accepted_at is null`,
    [userId, other, now],
  );
  return out.rowCount === 1;
}

// Declines, cancels or unfriends, whichever the pair's row is
export async function removeFriend(
  q: Q,
  userId: number,
  other: number,
): Promise<void> {
  await q.query(
    `delete from friendships where (requester_id = $1 and addressee_id = $2)
       or (requester_id = $2 and addressee_id = $1)`,
    [userId, other],
  );
}

// The user id of a "user:<id>" player, null for an anonymous one
export const userIdOf = (player: string): number | null =>
  player.startsWith("user:") ? Number(player.slice(5)) : null;

// Friends' first tries on one day, wins first (fewest guesses, then fastest). Banned
// friends are left out, as they are from the day's stats.
export async function friendResults(
  q: Q,
  userId: number,
  gameId: number,
  date: string,
): Promise<FriendResult[]> {
  const { rows } = await q.query<FriendResult>(
    `select fr.name, r.won, r.guesses, case when r.won then r.seconds end as seconds
     from (${friendsOf(1)}) fr
     join game_results r on r.player = 'user:' || fr.id and r.game_id = $2 and r.day = $3
     where fr.banned_at is null
     order by r.won desc, r.guesses, r.seconds nulls last, lower(fr.name)`,
    [userId, gameId, date],
  );
  return rows;
}

// Friends' first scores on a quiz, best first
export async function quizFriendResults(
  q: Q,
  userId: number,
  gameId: number,
): Promise<QuizFriendResult[]> {
  const { rows } = await q.query<QuizFriendResult>(
    `select fr.name, r.score::float8 as score, r.seconds
     from (${friendsOf(1)}) fr
     join quiz_results r on r.player = 'user:' || fr.id and r.game_id = $2
     where fr.banned_at is null
     order by r.score desc, r.seconds nulls last, lower(fr.name)`,
    [userId, gameId],
  );
  return rows;
}

// Emails `to` about `from`'s request unless they switched these emails off. Never throws: a
// mail problem must not fail the request.
export async function mailRequest(
  q: Q,
  mail: MailConfig,
  from: number,
  to: number,
): Promise<void> {
  try {
    const { rows } = await q.query<{ email: string; sender: string }>(
      `select t.email, coalesce(s.username, s.email) as sender
       from users t, users s where t.id = $2 and s.id = $1 and t.mail_friend_requests`,
      [from, to],
    );
    const row = rows[0];
    if (row) {
      await mail.mailer.send({
        to: row.email,
        subject: `Guessdle: ${row.sender} sent you a friend request`,
        text: `${row.sender} wants to be your friend on Guessdle. Friends see how each other did on the result screen.\n\nAccept or decline: ${mail.publicUrl}/friends\n\n--\nYou get this because someone sent you a friend request on Guessdle. Turn these emails off: ${mail.publicUrl}/settings\n`,
      });
    }
  } catch (err) {
    console.error("Could not mail the friend request", err);
  }
}
