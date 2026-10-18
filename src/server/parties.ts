// Party mode storage and rules (ADR 0016): the one seam between the party routes, the socket hub and the tables.
import { randomBytes } from "node:crypto";
import type { HintKind } from "../game/free-hint.ts";
import type pg from "pg";
import { MAX_OPEN_PARTIES, MAX_PARTY_PLAYERS } from "../game/limits.ts";
import {
  partyView,
  randomCode,
  type PartyPlayer,
  type PartyView,
  type RoundData,
} from "../game/party.ts";
import { hash } from "./auth.ts";
import {
  findGameById,
  loadRoster,
  type GameRow,
  type Roster,
} from "./games.ts";

type Q = Pick<pg.Pool, "query">;

const HOUR_MS = 3600_000;
// A party nobody acts in ends by itself; an ended one is deleted (freeing its code) after 30 days
export const IDLE_MS = 12 * HOUR_MS;
export const KEEP_MS = 30 * 24 * HOUR_MS;

export interface PartyRow {
  id: number;
  code: string;
  gameId: number;
  hostUserId: number;
  ended: boolean;
}

const newToken = (): string => randomBytes(24).toString("base64url");

// Ends parties idle for IDLE_MS (and their live rounds) and deletes those ended KEEP_MS ago.
// `code` limits it to one party, so a read never shows a stale open party.
export async function sweepParties(
  q: Q,
  now: Date,
  code?: string,
): Promise<void> {
  const idleSince = new Date(now.getTime() - IDLE_MS);
  const only = code === undefined ? "" : "and code = $2";
  const args = code === undefined ? [idleSince] : [idleSince, code];
  await q.query(
    `with ended as (
       update parties set ended_at = last_activity + interval '12 hours'
       where ended_at is null and last_activity < $1 ${only}
       returning id, ended_at
     )
     update party_rounds r set ended_at = ended.ended_at
     from ended where r.party_id = ended.id and r.ended_at is null`,
    args,
  );
  if (code === undefined) {
    await q.query("delete from parties where ended_at < $1", [
      new Date(now.getTime() - KEEP_MS),
    ]);
  }
}

export async function findParty(
  q: Q,
  code: string,
  now: Date,
): Promise<PartyRow | null> {
  await sweepParties(q, now, code);
  const { rows } = await q.query<PartyRow>(
    `select id::int, code, game_id::int as "gameId", host_user_id::int as "hostUserId",
       ended_at is not null as ended
     from parties where code = $1`,
    [code],
  );
  return rows[0] ?? null;
}

const openParties = async (q: Q, userId: number): Promise<number> =>
  (
    await q.query<{ n: number }>(
      "select count(*)::int as n from parties where host_user_id = $1 and ended_at is null",
      [userId],
    )
  ).rows[0]!.n;

export type CreateRefusal = "too_many_parties";

// Opens a party with its host as the first player; the token identifies the host's phone
export async function createParty(
  q: Q,
  game: GameRow,
  hostUserId: number,
  nickname: string,
  now: Date,
  random: () => number,
): Promise<{ code: string; token: string } | CreateRefusal> {
  await sweepParties(q, now);
  if ((await openParties(q, hostUserId)) >= MAX_OPEN_PARTIES) {
    return "too_many_parties";
  }
  for (;;) {
    const code = randomCode(random);
    const { rows } = await q.query<{ id: number }>(
      `insert into parties (code, game_id, host_user_id, created_at, last_activity)
       values ($1, $2, $3, $4, $4) on conflict (code) do nothing returning id::int`,
      [code, game.id, hostUserId, now],
    );
    if (rows[0]) {
      const token = newToken();
      await q.query(
        `insert into party_players (party_id, nickname, token_hash, host, joined_at)
         values ($1, $2, $3, true, $4)`,
        [rows[0].id, nickname, hash(token), now],
      );
      return { code, token };
    }
  }
}

export type JoinRefusal = "party_ended" | "nickname_taken" | "party_full";

// Under the party lock, so the player cap and nickname check hold
export async function joinParty(
  pool: pg.Pool,
  party: PartyRow,
  nickname: string,
  now: Date,
): Promise<{ token: string } | JoinRefusal> {
  return withPartyLock(pool, party.id, async (tx, ended) => {
    if (ended) {
      return "party_ended";
    }
    const { rows } = await tx.query<{ n: number; taken: boolean }>(
      `select count(*)::int as n, coalesce(bool_or(lower(nickname) = lower($2)), false) as taken
       from party_players where party_id = $1 and removed_at is null`,
      [party.id, nickname],
    );
    if (rows[0]!.taken) {
      return "nickname_taken";
    }
    if (rows[0]!.n >= MAX_PARTY_PLAYERS) {
      return "party_full";
    }
    const token = newToken();
    await tx.query(
      `insert into party_players (party_id, nickname, token_hash, joined_at) values ($1, $2, $3, $4)`,
      [party.id, nickname, hash(token), now],
    );
    await touch(tx, party.id, now);
    return { token };
  });
}

// The current player a phone's token names, or null (unknown, or removed by the host)
export async function playerByToken(
  q: Q,
  partyId: number,
  token: string,
): Promise<number | null> {
  const { rows } = await q.query<{ id: number }>(
    `select id::int from party_players
     where party_id = $1 and token_hash = $2 and removed_at is null`,
    [partyId, hash(token)],
  );
  return rows[0]?.id ?? null;
}

// The host's player, for a host who signs in on another device
export async function hostPlayerId(q: Q, partyId: number): Promise<number> {
  const { rows } = await q.query<{ id: number }>(
    "select id::int from party_players where party_id = $1 and host",
    [partyId],
  );
  return rows[0]!.id;
}

export const isCurrentPlayer = async (
  q: Q,
  playerId: number,
): Promise<boolean> =>
  (
    await q.query(
      "select 1 from party_players where id = $1 and removed_at is null",
      [playerId],
    )
  ).rowCount === 1;

export interface PartyData {
  game: GameRow;
  roster: Roster;
  players: PartyPlayer[];
  rounds: (RoundData & { id: number })[];
}

export async function loadData(q: Q, party: PartyRow): Promise<PartyData> {
  const game = (await findGameById(q, party.gameId))!;
  const roster = await loadRoster(q, game);
  const players = await q.query<PartyPlayer>(
    `select id::int, nickname, host, (extract(epoch from joined_at) * 1000)::float8 as "joinedAt"
     from party_players where party_id = $1 and removed_at is null order by id`,
    [party.id],
  );
  const rounds = await q.query<{
    id: number;
    number: number;
    answerId: number;
    startedAt: number;
    endedAt: number | null;
  }>(
    `select id::int, number, answer_entry_id::int as "answerId",
       (extract(epoch from started_at) * 1000)::float8 as "startedAt",
       (extract(epoch from ended_at) * 1000)::float8 as "endedAt"
     from party_rounds where party_id = $1 order by number`,
    [party.id],
  );
  const guesses = await q.query<{
    roundId: number;
    playerId: number;
    entryId: number;
    at: number;
  }>(
    `select g.round_id::int as "roundId", g.player_id::int as "playerId", g.entry_id::int as "entryId",
       (extract(epoch from g.guessed_at) * 1000)::float8 as at
     from party_guesses g join party_rounds r on r.id = g.round_id
     where r.party_id = $1 order by g.seq`,
    [party.id],
  );
  const giveUps = await q.query<{
    roundId: number;
    playerId: number;
    at: number;
  }>(
    `select u.round_id::int as "roundId", u.player_id::int as "playerId",
       (extract(epoch from u.gave_up_at) * 1000)::float8 as at
     from party_give_ups u join party_rounds r on r.id = u.round_id
     where r.party_id = $1`,
    [party.id],
  );
  const hints = await q.query<{
    roundId: number;
    playerId: number;
    kind: HintKind;
    attribute: string | null;
  }>(
    `select h.round_id::int as "roundId", h.player_id::int as "playerId", h.kind, h.attribute
     from party_hints h join party_rounds r on r.id = h.round_id
     where r.party_id = $1`,
    [party.id],
  );
  return {
    game,
    roster,
    players: players.rows,
    rounds: rounds.rows.map((r) => ({
      ...r,
      ...(game.kind === "blur" && { tries: game.blurTries }),
      guesses: guesses.rows
        .filter((g) => g.roundId === r.id)
        .map(({ playerId, entryId, at }) => ({ playerId, entryId, at })),
      giveUps: giveUps.rows
        .filter((g) => g.roundId === r.id)
        .map(({ playerId, at }) => ({ playerId, at })),
      hints: hints.rows
        .filter((h) => h.roundId === r.id)
        .map(({ playerId, kind, attribute }) => ({
          playerId,
          pick:
            kind === "attribute"
              ? { kind, attribute: attribute ?? "" }
              : { kind: "description" as const },
        })),
    })),
  };
}

// What `viewers` (player ids, null for a visitor) each see of the party
export async function viewsOf(
  q: Q,
  party: PartyRow,
  viewers: readonly (number | null)[],
): Promise<Map<number | null, PartyView>> {
  const { game, roster, players, rounds } = await loadData(q, party);
  const ended =
    (
      await q.query<{ ended: boolean }>(
        "select ended_at is not null as ended from parties where id = $1",
        [party.id],
      )
    ).rows[0]?.ended ?? true;
  return new Map(
    [...new Set(viewers)].map((viewer) => [
      viewer,
      partyView({
        code: party.code,
        game: {
          slug: game.slug,
          name: game.name,
          kind: game.kind,
          ...(game.kind === "blur" && { blurTries: game.blurTries }),
        },
        attributes: roster.attributes,
        entries: roster.entries,
        all: roster.all,
        ended,
        players,
        rounds,
        viewer,
      }),
    ]),
  );
}

export async function withPartyLock<T>(
  pool: pg.Pool,
  partyId: number,
  work: (tx: pg.PoolClient, ended: boolean) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    // Serializes every change to one party, so "everyone is done" and caps are read under the lock
    const { rows } = await client.query<{ ended: boolean }>(
      "select ended_at is not null as ended from parties where id = $1 for update",
      [partyId],
    );
    const out = await work(client, rows[0]?.ended ?? true);
    await client.query("commit");
    return out;
  } catch (err) {
    await client.query("rollback");
    throw err;
  } finally {
    client.release();
  }
}

export const touch = (q: Q, partyId: number, now: Date): Promise<unknown> =>
  q.query("update parties set last_activity = $2 where id = $1", [
    partyId,
    now,
  ]);
