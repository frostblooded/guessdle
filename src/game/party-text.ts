// Party mode's words for the page (issue #90, ADR 0016): places, solve times, progress and
// why an action was refused.
import type { LiveRound, PartyRefusal } from "./party.ts";

// "1st", "2nd", "3rd", "4th", ... "11th", "21st"
export function ordinal(n: number): string {
  const teen = n % 100 >= 11 && n % 100 <= 13;
  const suffix = teen ? "th" : (["th", "st", "nd", "rd"][n % 10] ?? "th");
  return `${n}${suffix}`;
}

// A solve time as a clock: 0:07, 1:23, 1:02:03
export function clockTime(ms: number): string {
  const total = Math.floor(ms / 1000);
  const [h, m, sec] = [
    Math.floor(total / 3600),
    Math.floor(total / 60) % 60,
    total % 60,
  ];
  const pad = (n: number): string => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}

// How a player is doing in the live round, as the scoreboard says it
export function progressLabel(p: LiveRound["progress"][number]): string {
  if (p.answered !== undefined) {
    return p.answered ? "Answered" : "Thinking…";
  }
  const count = `${p.guesses} ${p.guesses === 1 ? "guess" : "guesses"}`;
  return p.solved
    ? `${count}, solved`
    : p.gaveUp
      ? `${count}, gave up`
      : p.lost
        ? `${count}, out of tries`
        : count;
}

export const REFUSAL_TEXT: Record<PartyRefusal, string> = {
  invalid:
    "That is not one of this game's entries, or an answer this question takes.",
  not_host: "Only the host can do that.",
  not_player: "Join the party to play.",
  no_round: "There is no round going on right now.",
  round_live: "A round is already going on.",
  finished: "You are done with this round. Wait for the next one.",
  duplicate: "You already guessed that one.",
  party_ended: "This party has ended.",
  not_enough_entries: "This game needs an entry before a round can start.",
  game_paused:
    "This game is paused while some of its entries are missing values.",
  no_hint: "No free hint is available right now.",
  no_questions_left: "Every question of this quiz has been played.",
  server_error: "The server hit an unexpected problem. Try again in a moment.",
};
