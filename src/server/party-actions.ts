// What a player's socket message does to a party (ADR 0016), under the party lock.
import type pg from "pg";
import { isImageGame } from "../game/blur.ts";
import { pickHint } from "../game/free-hint.ts";
import { gradeGuess } from "../game/game.ts";
import { playBlocker } from "./access.ts";
import { SKIP } from "../game/game.ts";
import {
  drawAnswer,
  everyoneDone,
  isDone,
  participants,
  progressOf,
  type ClientMessage,
  type PartyRefusal,
} from "../game/party.ts";
import { loadData, touch, withPartyLock, type PartyRow } from "./parties.ts";

type Q = Pick<pg.Pool, "query">;

const endRound = (q: Q, roundId: number, now: Date): Promise<unknown> =>
  q.query(
    "update party_rounds set ended_at = $2 where id = $1 and ended_at is null",
    [roundId, now],
  );

// Applies one player's message under the party lock. Null when it changed the party.
export async function act(
  pool: pg.Pool,
  party: PartyRow,
  playerId: number,
  msg: Exclude<ClientMessage, { type: "hello" }>,
  now: Date,
  random: () => number,
): Promise<PartyRefusal | null> {
  return withPartyLock(pool, party.id, async (tx, ended) => {
    if (ended) {
      return "party_ended";
    }
    const data = await loadData(tx, party);
    const me = data.players.find((p) => p.id === playerId);
    if (!me) {
      return "not_player";
    }
    const latest = data.rounds.at(-1);
    const live = latest?.endedAt === null ? latest : undefined;
    // Re-read after a change: does the live round end by itself now?
    const endIfAllDone = async (): Promise<void> => {
      const after = await loadData(tx, party);
      const round = after.rounds.at(-1)!;
      if (everyoneDone(after.players, round)) {
        await endRound(tx, round.id, now);
      }
    };
    const refusal = await (async (): Promise<PartyRefusal | null> => {
      switch (msg.type) {
        case "hint": {
          if (!live) {
            return "no_round";
          }
          if (
            !participants(data.players, live).includes(me) ||
            isDone(progressOf(live, me.id))
          ) {
            return "finished";
          }
          const { attributes, all } = data.roster;
          const answer = all.find((e) => e.id === live.answerId);
          if (
            !answer ||
            data.game.kind !== "classic" ||
            live.hints?.some((h) => h.playerId === me.id)
          ) {
            return "no_hint";
          }
          const rows = live.guesses
            .filter((g) => g.playerId === me.id)
            .flatMap((g) => all.filter((e) => e.id === g.entryId))
            .map((guess) => gradeGuess(attributes, answer, guess));
          const pick = pickHint(attributes, answer, rows, msg.kind, random);
          if (!pick) {
            return "no_hint";
          }
          await tx.query(
            "insert into party_hints (round_id, player_id, kind, attribute) values ($1, $2, $3, $4)",
            [
              live.id,
              me.id,
              pick.kind,
              pick.kind === "attribute" ? pick.attribute : null,
            ],
          );
          return null;
        }
        case "guess":
        case "give-up": {
          if (!live) {
            return "no_round";
          }
          const mine = progressOf(live, me.id);
          if (!participants(data.players, live).includes(me) || isDone(mine)) {
            return "finished";
          }
          if (msg.type === "give-up") {
            await tx.query(
              "insert into party_give_ups (round_id, player_id, gave_up_at) values ($1, $2, $3)",
              [live.id, me.id, now],
            );
          } else {
            const skip = msg.entryId === SKIP && isImageGame(data.game.kind);
            if (
              !skip &&
              !data.roster.entries.some((e) => e.id === msg.entryId)
            ) {
              return "invalid";
            }
            if (
              !skip &&
              live.guesses.some(
                (g) => g.playerId === me.id && g.entryId === msg.entryId,
              )
            ) {
              return "duplicate";
            }
            await tx.query(
              "insert into party_guesses (round_id, player_id, entry_id, guessed_at) values ($1, $2, $3, $4)",
              [live.id, me.id, skip ? null : msg.entryId, now],
            );
          }
          await endIfAllDone();
          return null;
        }
        default:
          break;
      }
      if (!me.host) {
        return "not_host";
      }
      switch (msg.type) {
        case "start-round": {
          if (live) {
            return "round_live";
          }
          const blocker = playBlocker(data.game, data.roster);
          if (blocker) {
            return blocker;
          }
          await tx.query(
            `insert into party_rounds (party_id, number, answer_entry_id, started_at)
             values ($1, $2, $3, $4)`,
            [
              party.id,
              (latest?.number ?? 0) + 1,
              drawAnswer(
                data.roster.answerIds,
                data.rounds.map((r) => r.answerId),
                random,
              ),
              now,
            ],
          );
          return null;
        }
        case "end-round":
          if (!live) {
            return "no_round";
          }
          await endRound(tx, live.id, now);
          return null;
        case "remove-player": {
          const target = data.players.find((p) => p.id === msg.playerId);
          if (!target || target.host) {
            return "invalid";
          }
          await tx.query(
            "update party_players set removed_at = $2 where id = $1",
            [target.id, now],
          );
          if (live) {
            await endIfAllDone();
          }
          return null;
        }
        case "end-party":
          if (live) {
            await endRound(tx, live.id, now);
          }
          await tx.query("update parties set ended_at = $2 where id = $1", [
            party.id,
            now,
          ]);
          return null;
      }
    })();
    if (refusal === null) {
      await touch(tx, party.id, now);
    }
    return refusal;
  });
}
