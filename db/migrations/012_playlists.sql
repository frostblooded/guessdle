-- Playlists (issue: player playlists): a signed-in player's named lists of games, public or
-- private, shown on their profile at /u/<username>. The username is picked once, lowercase,
-- and is the only public name a player has (users.name is their email).
alter table users add column username text unique
  check (username ~ '^[a-z0-9_]{3,20}$');

create table playlists (
  id bigserial primary key,
  owner_id bigint not null references users (id) on delete cascade,
  name text not null,
  description text not null default '',
  public boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index playlists_owner_id on playlists (owner_id);

-- A game stays in the table while hidden (paused, unapproved); reads only show gallery games
create table playlist_games (
  playlist_id bigint not null references playlists (id) on delete cascade,
  game_id bigint not null references games (id) on delete cascade,
  position integer not null,
  primary key (playlist_id, game_id)
);
create index playlist_games_game_id on playlist_games (game_id);
