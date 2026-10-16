-- A signed-in player's guesses (by pet id) and give-up per day. Victory is never stored:
-- it is derived from the guesses and the day's current answer.
create table user_guesses (
  user_id bigint not null references users (id) on delete cascade,
  day date not null,
  pet_id text not null,
  seq bigserial not null,
  primary key (user_id, day, pet_id)
);

create table user_give_ups (
  user_id bigint not null references users (id) on delete cascade,
  day date not null,
  primary key (user_id, day)
);
