-- Entry descriptions: optional text an Owner writes about an Entry. It shows once the answer
-- is revealed, and a classic game's Free Hint can reveal it early.
alter table entries add column description text not null default '';

-- Free Hints (classic games): after 3 wrong guesses a player may reveal one thing about the
-- answer, once per day (or round). An attribute hint stores which attribute was drawn, by name;
-- the value is read from the answer when shown, so an Override applies at once.
create table user_hints (
  user_id bigint not null references users (id) on delete cascade,
  game_id bigint not null references games (id) on delete cascade,
  day date not null,
  kind text not null check (kind in ('attribute', 'description')),
  attribute text,
  primary key (user_id, game_id, day)
);

create table party_hints (
  round_id bigint not null references party_rounds (id) on delete cascade,
  player_id bigint not null references party_players (id) on delete cascade,
  kind text not null check (kind in ('attribute', 'description')),
  attribute text,
  primary key (round_id, player_id)
);
