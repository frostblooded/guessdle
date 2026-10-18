-- A player's first win of the day on a game, shown in the victory popup next to the others.
-- `player` is "user:<id>" for an account or "anon:<token>" for a browser's random token, so
-- one player counts once a day; replays after a reset never change it. `seconds` runs from
-- the first guess to the winning one, null when the browser did not see the first guess.
create table game_results (
  game_id bigint not null references games (id) on delete cascade,
  day date not null,
  player text not null,
  guesses int not null check (guesses >= 1),
  seconds int check (seconds >= 0),
  primary key (game_id, day, player)
);
