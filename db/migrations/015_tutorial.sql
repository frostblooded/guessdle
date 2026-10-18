-- How to play's practice game: a frozen copy of the pet game's active entries as they were when
-- this migration ran. The tutorial reads only this copy, so later edits to the game never change
-- it. One row; the pictures it names keep their files alive (upload-refs.ts).
create table tutorial (
  id smallint primary key default 1 check (id = 1),
  -- [{name, type}] in column order
  attributes jsonb not null,
  -- [{id, name, photo, values}]: values one per attribute (List as an array, others a string,
  -- Image the upload URL); photo is the first Image value, blank when none
  entries jsonb not null,
  -- The practice game's secret: Ati, else the first entry
  answer_id integer not null,
  created_at timestamptz not null default now()
);

with game as (
  select id from games where slug = 'petdle'
),
attrs as (
  select a.id, a.name, a.type, row_number() over (order by a.position, a.id) as n
  from attributes a join game g on g.id = a.game_id
),
pets as (
  select e.id, e.name
  from entries e join game g on g.id = e.game_id
  where e.deleted_at is null
),
cells as (
  select p.id as entry_id, a.n, a.type,
    case when a.type = 'list' then
      coalesce((select jsonb_agg(v.value order by v.position) from entry_values v
                where v.entry_id = p.id and v.attribute_id = a.id), '[]'::jsonb)
    else
      to_jsonb(coalesce((select v.value from entry_values v
                         where v.entry_id = p.id and v.attribute_id = a.id
                         order by v.position limit 1), ''))
    end as value
  from pets p cross join attrs a
)
insert into tutorial (attributes, entries, answer_id)
select
  coalesce((select jsonb_agg(jsonb_build_object('name', name, 'type', type) order by n) from attrs),
    '[]'::jsonb),
  (select jsonb_agg(jsonb_build_object(
      'id', p.id,
      'name', p.name,
      'photo', coalesce((select c.value #>> '{}' from cells c
                         where c.entry_id = p.id and c.type = 'image' and c.value <> '""'::jsonb
                         order by c.n limit 1), ''),
      'values', coalesce((select jsonb_agg(c.value order by c.n) from cells c where c.entry_id = p.id),
        '[]'::jsonb)
    ) order by lower(p.name), p.id) from pets p),
  coalesce((select id from pets where name = 'Ati' order by id limit 1),
    (select id from pets order by lower(name), id limit 1))
where exists (select 1 from pets);

-- Every picture URL the tutorial shows, for upload reference checks
create view tutorial_photos as
select v.value #>> '{}' as url
from tutorial t,
  jsonb_array_elements(t.attributes) with ordinality a (attr, n),
  jsonb_array_elements(t.entries) e (entry),
  jsonb_array_elements(e.entry -> 'values') with ordinality v (value, m)
where a.n = v.m and a.attr ->> 'type' = 'image';
