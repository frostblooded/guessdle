-- A Blur game's skip (ADR 0019): a guess with no entry. It uses a try and clears the next
-- square like a wrong guess, so it is stored in the guess order with a null entry_id. The
-- primary keys move to seq, and a guessed entry stays unique per player through a unique
-- constraint (nulls are distinct, so any number of skips fit).
alter table user_guesses drop constraint user_guesses_pkey;
alter table user_guesses alter column entry_id drop not null;
alter table user_guesses add primary key (seq);
alter table user_guesses add constraint user_guesses_entry
  unique (user_id, game_id, day, entry_id);

alter table party_guesses drop constraint party_guesses_pkey;
alter table party_guesses alter column entry_id drop not null;
alter table party_guesses add primary key (seq);
alter table party_guesses add constraint party_guesses_entry
  unique (round_id, player_id, entry_id);
