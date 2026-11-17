------------------------------- MODULE Party -------------------------------
(***************************************************************************)
(* Party mode (ADR 0016) as TLC sees it: one party, its players and its    *)
(* rounds, every change atomic as under the party row lock. Each action    *)
(* names the code it models. `npm run model` checks the invariants and     *)
(* that a live round always ends while players keep playing.               *)
(***************************************************************************)
EXTENDS Naturals, FiniteSets

CONSTANTS
    Players,    \* everyone who might join, the host included
    Host,       \* the player who opened the party
    Entries,    \* active entries: a player guesses each at most once a round
    Tries,      \* a Blur game's tries a round; 0 for a classic game (unlimited)
    MaxRounds   \* bounds the state space

ASSUME Host \in Players /\ Entries >= 2 /\ Tries \in Nat /\ MaxRounds >= 1

Done == {"solved", "gaveup", "lost"}
Status == {"none", "playing"} \cup Done

VARIABLES
    joined,   \* current players (party_players with removed_at null)
    status,   \* each player's state in the latest round
    wrong,    \* wrong guesses in the latest round
    live,     \* the latest round has not ended
    rounds,   \* rounds started
    ended     \* the party has ended (by the host or idle for 12 hours)

vars == <<joined, status, wrong, live, rounds, ended>>

(* everyoneDone in src/game/party.ts: participants are the current players *)
EveryoneDone(js, st) == js # {} /\ \A p \in js : st[p] \in Done

(* endIfAllDone in src/server/party-actions.ts, after a change to status *)
Settle(js, st) == live' = (live /\ ~EveryoneDone(js, st))

Init ==
    /\ joined = {Host}
    /\ status = [p \in Players |-> "none"]
    /\ wrong = [p \in Players |-> 0]
    /\ live = FALSE
    /\ rounds = 0
    /\ ended = FALSE

(* joinParty in src/server/parties.ts: a late joiner plays the live round; a removed player
   who joins again under the same nickname is restored with their board for the round *)
Join(p) ==
    /\ ~ended
    /\ p \notin joined
    /\ joined' = joined \cup {p}
    /\ status' = [status EXCEPT ![p] = IF @ # "none" THEN @ ELSE IF live THEN "playing" ELSE "none"]
    /\ UNCHANGED <<wrong, live, rounds, ended>>

(* act "start-round": host only, no live round *)
StartRound ==
    /\ ~ended
    /\ ~live
    /\ rounds < MaxRounds
    /\ live' = TRUE
    /\ rounds' = rounds + 1
    /\ status' = [p \in Players |-> IF p \in joined THEN "playing" ELSE "none"]
    /\ wrong' = [p \in Players |-> 0]
    /\ UNCHANGED <<joined, ended>>

Playing(p) == ~ended /\ live /\ p \in joined /\ status[p] = "playing"

(* act "guess" with a wrong entry; a Blur game is lost on the last try *)
WrongGuess(p) ==
    /\ Playing(p)
    /\ wrong[p] < Entries - 1
    /\ wrong' = [wrong EXCEPT ![p] = @ + 1]
    /\ LET st == [status EXCEPT ![p] =
                    IF Tries > 0 /\ wrong[p] + 1 >= Tries THEN "lost" ELSE "playing"]
       IN status' = st /\ Settle(joined, st)
    /\ UNCHANGED <<joined, rounds, ended>>

(* act "guess" with the answer *)
RightGuess(p) ==
    /\ Playing(p)
    /\ LET st == [status EXCEPT ![p] = "solved"]
       IN status' = st /\ Settle(joined, st)
    /\ UNCHANGED <<joined, wrong, rounds, ended>>

(* act "give-up" *)
GiveUp(p) ==
    /\ Playing(p)
    /\ LET st == [status EXCEPT ![p] = "gaveup"]
       IN status' = st /\ Settle(joined, st)
    /\ UNCHANGED <<joined, wrong, rounds, ended>>

(* act "end-round": host only *)
EndRound ==
    /\ ~ended
    /\ live
    /\ live' = FALSE
    /\ UNCHANGED <<joined, status, wrong, rounds, ended>>

(* act "remove-player": host only, never the host; the round may end now. The player row keeps
   its guesses, so status and wrong stay for a later rejoin *)
Remove(p) ==
    /\ ~ended
    /\ p \in joined
    /\ p # Host
    /\ joined' = joined \ {p}
    /\ Settle(joined', status)
    /\ UNCHANGED <<status, wrong, rounds, ended>>

(* act "end-party", and sweepParties after 12 idle hours: both end the live round *)
EndParty ==
    /\ ~ended
    /\ ended' = TRUE
    /\ live' = FALSE
    /\ UNCHANGED <<joined, status, wrong, rounds>>

Next ==
    \/ StartRound \/ EndRound \/ EndParty
    \/ \E p \in Players : Join(p) \/ WrongGuess(p) \/ RightGuess(p) \/ GiveUp(p) \/ Remove(p)

(* A player who keeps getting the chance eventually finishes (a give-up at worst), even if the
   host keeps removing them and they keep joining again. The host is never forced to end a
   round or the party, so a round must end by itself. *)
Spec == Init /\ [][Next]_vars /\ \A p \in Players : SF_vars(GiveUp(p))

-----------------------------------------------------------------------------
TypeOK ==
    /\ joined \subseteq Players
    /\ status \in [Players -> Status]
    /\ wrong \in [Players -> 0..(Entries - 1)]
    /\ live \in BOOLEAN /\ ended \in BOOLEAN
    /\ rounds \in 0..MaxRounds

HostStays == Host \in joined

EndedPartyHasNoLiveRound == ended => ~live

(* A live round always has someone still playing: it never hangs with everyone done *)
LiveRoundHasAPlayer == live => \E p \in joined : status[p] = "playing"

NoStatusBetweenRounds == ~live /\ rounds = 0 => \A p \in Players : status[p] = "none"

BlurTriesHold == Tries > 0 => \A p \in Players : wrong[p] <= Tries

(* Liveness: every live round ends, however often the host removes players and they join
   again. Before rejoining restored the player, TLC found a host who removed each player after
   they finished while they joined again with a fresh board for the same round, forever. *)
RoundsEnd == [](live => <>~live)

(* No replay: within a round, a player who finished stays finished, even after removal and rejoining *)
FinishedStaysFinished ==
    [][\A p \in Players : rounds' = rounds /\ status[p] \in Done => status'[p] = status[p]]_vars
=============================================================================
