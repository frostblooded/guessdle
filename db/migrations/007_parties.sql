-- Party mode (issue #90, ADR 0016): a signed-in host opens a party on one game, guests join
-- by code with a nickname, and every round has its own random secret entry. Ended parties
-- and their results are deleted 30 days after they end, which frees the code.
create table parties (
  id bigserial primary key,
  code text not null unique,
  game_id bigint not null references games (id) on delete cascade,
  host_user_id bigint not null references users (id) on delete cascade,
  created_at timestamptz not null,
  last_activity timestamptz not null,
  ended_at timestamptz
);

-- A player is known by a random token kept on their phone; only its hash is stored
create table party_players (
  id bigserial primary key,
  party_id bigint not null references parties (id) on delete cascade,
  nickname text not null,
  token_hash text not null unique,
  host boolean not null default false,
  joined_at timestamptz not null,
  removed_at timestamptz
);
-- Nicknames are unique among a party's current players, whatever their case
create unique index party_players_nickname on party_players (party_id, lower(nickname))
  where removed_at is null;

create table party_rounds (
  id bigserial primary key,
  party_id bigint not null references parties (id) on delete cascade,
  number int not null,
  answer_entry_id bigint not null references entries (id) on delete cascade,
  started_at timestamptz not null,
  ended_at timestamptz,
  unique (party_id, number)
);

create table party_guesses (
  round_id bigint not null references party_rounds (id) on delete cascade,
  player_id bigint not null references party_players (id) on delete cascade,
  entry_id bigint not null references entries (id) on delete cascade,
  seq bigserial not null,
  guessed_at timestamptz not null,
  primary key (round_id, player_id, entry_id)
);

create table party_give_ups (
  round_id bigint not null references party_rounds (id) on delete cascade,
  player_id bigint not null references party_players (id) on delete cascade,
  gave_up_at timestamptz not null,
  primary key (round_id, player_id)
);
