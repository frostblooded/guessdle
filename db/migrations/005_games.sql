-- Games: Petdle becomes game 1 in the database (spec #66). Stored pet ids are
-- rewritten to numeric entry ids; no legacy id survives.

create table games (
  id bigserial primary key,
  slug text not null unique,
  name text not null,
  description text not null default '',
  cover_url text not null default '',
  owner_id bigint references users (id) on delete cascade,
  status text not null default 'draft'
    check (status in ('draft', 'pending', 'approved', 'rejected')),
  reject_reason text not null default '',
  -- Day Number 0
  start_date date not null,
  -- null means 5; clamped to N-1 at draw time
  skip_period integer check (skip_period >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table attributes (
  id bigserial primary key,
  game_id bigint not null references games (id) on delete cascade,
  name text not null,
  type text not null check (type in ('text', 'list')),
  position integer not null
);
create index attributes_game_id on attributes (game_id);

create table entries (
  id bigserial primary key,
  game_id bigint not null references games (id) on delete cascade,
  name text not null,
  photo_url text not null default '',
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index entries_game_id on entries (game_id);

create table entry_values (
  entry_id bigint not null references entries (id) on delete cascade,
  attribute_id bigint not null references attributes (id) on delete cascade,
  position integer not null,
  value text not null,
  primary key (entry_id, attribute_id, position)
);

insert into games (slug, name, description, status, start_date)
values ('petdle', 'Petdle', 'Guess the pet of the day from its colors and owners.', 'approved', '2025-08-15');

insert into attributes (game_id, name, type, position)
select g.id, a.name, 'list', a.position
from games g, (values ('Colors', 0), ('Owners', 1)) as a (name, position)
where g.slug = 'petdle';

create temp table pet_map (pet_id text primary key, name text not null, entry_id bigint) on commit drop;
insert into pet_map (pet_id, name) values
('ati', 'Ati'),
  ('bela', 'Bela'),
  ('cookie', 'Cookie'),
  ('dido', 'Dido'),
  ('eddie', 'Eddie'),
  ('eli', 'Eli'),
  ('ilko', 'Ilko'),
  ('jaro', 'Jaro'),
  ('jeffy', 'Jeffy'),
  ('kiara', 'Kiara'),
  ('kimi', 'Kimi'),
  ('mochi', 'Mochi'),
  ('murlin', 'Murlin'),
  ('oreo', 'Oreo'),
  ('patio', 'Patio'),
  ('pipi', 'Pipi'),
  ('puhche', 'Puhche'),
  ('sunny', 'Sunny'),
  ('todorka', 'Todorka');

-- Inserted in roster order, so entry ids run 1..19 in that order
insert into entries (game_id, name, photo_url)
select g.id, m.name, '/photos/' || m.pet_id || '.jpg'
from pet_map m, games g where g.slug = 'petdle' order by m.pet_id;

update pet_map m set entry_id = e.id from entries e where e.name = m.name;

insert into entry_values (entry_id, attribute_id, position, value)
select m.entry_id, a.id, v.position, v.value
from (values
  ('ati', 'Colors', 0, 'Black'),
  ('ati', 'Colors', 1, 'Orange'),
  ('ati', 'Colors', 2, 'White'),
  ('ati', 'Owners', 0, 'Niki'),
  ('bela', 'Colors', 0, 'Black'),
  ('bela', 'Colors', 1, 'Grey'),
  ('bela', 'Colors', 2, 'White'),
  ('bela', 'Owners', 0, 'Beti'),
  ('cookie', 'Colors', 0, 'Black'),
  ('cookie', 'Colors', 1, 'Orange'),
  ('cookie', 'Colors', 2, 'White'),
  ('cookie', 'Owners', 0, 'Niki'),
  ('dido', 'Colors', 0, 'Grey'),
  ('dido', 'Colors', 1, 'White'),
  ('dido', 'Owners', 0, 'Beti'),
  ('eddie', 'Colors', 0, 'Orange'),
  ('eddie', 'Colors', 1, 'White'),
  ('eddie', 'Owners', 0, 'Stefi'),
  ('eddie', 'Owners', 1, 'Yasen'),
  ('eli', 'Colors', 0, 'Black'),
  ('eli', 'Colors', 1, 'Blue'),
  ('eli', 'Colors', 2, 'White'),
  ('eli', 'Owners', 0, 'Beti'),
  ('ilko', 'Colors', 0, 'Black'),
  ('ilko', 'Colors', 1, 'Purple'),
  ('ilko', 'Colors', 2, 'White'),
  ('ilko', 'Owners', 0, 'Beti'),
  ('jaro', 'Colors', 0, 'Grey'),
  ('jaro', 'Owners', 0, 'Ico'),
  ('jeffy', 'Colors', 0, 'Grey'),
  ('jeffy', 'Owners', 0, 'Ico'),
  ('kiara', 'Colors', 0, 'Black'),
  ('kiara', 'Colors', 1, 'Orange'),
  ('kiara', 'Colors', 2, 'White'),
  ('kiara', 'Owners', 0, 'Antonio'),
  ('kiara', 'Owners', 1, 'Tanya'),
  ('kimi', 'Colors', 0, 'Black'),
  ('kimi', 'Colors', 1, 'Orange'),
  ('kimi', 'Colors', 2, 'White'),
  ('kimi', 'Owners', 0, 'Bori'),
  ('mochi', 'Colors', 0, 'Orange'),
  ('mochi', 'Colors', 1, 'White'),
  ('mochi', 'Owners', 0, 'Petya'),
  ('murlin', 'Colors', 0, 'Grey'),
  ('murlin', 'Owners', 0, 'Antonio'),
  ('murlin', 'Owners', 1, 'Tanya'),
  ('oreo', 'Colors', 0, 'Black'),
  ('oreo', 'Colors', 1, 'White'),
  ('oreo', 'Owners', 0, 'Cveti'),
  ('oreo', 'Owners', 1, 'Vili'),
  ('patio', 'Colors', 0, 'Green'),
  ('patio', 'Colors', 1, 'Yellow'),
  ('patio', 'Owners', 0, 'Beti'),
  ('pipi', 'Colors', 0, 'Grey'),
  ('pipi', 'Colors', 1, 'White'),
  ('pipi', 'Owners', 0, 'Beti'),
  ('puhche', 'Colors', 0, 'Black'),
  ('puhche', 'Colors', 1, 'White'),
  ('puhche', 'Owners', 0, 'Cveti'),
  ('puhche', 'Owners', 1, 'Vili'),
  ('sunny', 'Colors', 0, 'Yellow'),
  ('sunny', 'Colors', 1, 'Blue'),
  ('sunny', 'Owners', 0, 'Beti'),
  ('todorka', 'Colors', 0, 'Black'),
  ('todorka', 'Colors', 1, 'White'),
  ('todorka', 'Owners', 0, 'Didi')
) as v (pet_id, attribute, position, value)
join pet_map m on m.pet_id = v.pet_id
join attributes a on a.name = v.attribute
join games g on g.id = a.game_id and g.slug = 'petdle';

-- daily_answers
alter table daily_answers add column game_id bigint references games (id) on delete cascade;
alter table daily_answers add column entry_id bigint references entries (id);
update daily_answers d set game_id = g.id, entry_id = m.entry_id
from games g, pet_map m where g.slug = 'petdle' and m.pet_id = d.pet_id;
alter table daily_answers alter column game_id set not null;
alter table daily_answers alter column entry_id set not null;
alter table daily_answers drop constraint daily_answers_pkey;
alter table daily_answers drop column pet_id;
alter table daily_answers add primary key (game_id, day);

-- user_guesses (guesses of pets that already left the roster were invisible: dropped)
alter table user_guesses add column game_id bigint references games (id) on delete cascade;
alter table user_guesses add column entry_id bigint references entries (id);
update user_guesses u set game_id = g.id, entry_id = m.entry_id
from games g, pet_map m where g.slug = 'petdle' and m.pet_id = u.pet_id;
delete from user_guesses where entry_id is null;
alter table user_guesses alter column game_id set not null;
alter table user_guesses alter column entry_id set not null;
alter table user_guesses drop constraint user_guesses_pkey;
alter table user_guesses drop column pet_id;
alter table user_guesses add primary key (user_id, game_id, day, entry_id);

-- user_give_ups
alter table user_give_ups add column game_id bigint references games (id) on delete cascade;
update user_give_ups set game_id = (select id from games where slug = 'petdle');
alter table user_give_ups alter column game_id set not null;
alter table user_give_ups drop constraint user_give_ups_pkey;
alter table user_give_ups add primary key (user_id, game_id, day);
