-- Sequence games (ADR 0020): like guessthe.game, players guess the entry from a sequence of
-- photos, one more shown per wrong guess or skip. blur_tries is also a Sequence game's number
-- of photos (and tries).
alter table games drop constraint games_kind_check;
alter table games add constraint games_kind_check
  check (kind in ('classic', 'blur', 'sequence'));

-- A Sequence entry's photos in the order players see them, '' for a slot not uploaded yet.
-- Only an entry with every one of the game's photos may be an answer.
alter table entries add column shots text[] not null default '{}'
  check (cardinality(shots) <= 9);

-- Skips (Blur and Sequence games): a skip uses up a try like a wrong guess. They share the guess
-- sequence, so a day's guesses and skips read back in the order they were made.
create table user_skips (
  user_id bigint not null references users (id) on delete cascade,
  game_id bigint not null references games (id) on delete cascade,
  day date not null,
  seq bigint not null default nextval('user_guesses_seq_seq') primary key
);
create index user_skips_day on user_skips (user_id, game_id, day);
