-- How to play's practice game (spec: the tutorial thread, 2026-10-18): a frozen copy of Petdle's
-- active pets as they were when this migration ran. The tutorial reads only this copy, so later
-- edits to Petdle never change it. One row; its photo URLs keep their files alive (upload-refs.ts).
create table tutorial (
  id smallint primary key default 1 check (id = 1),
  -- [{name, type}] in column order
  attributes jsonb not null,
  -- [{id, name, photo, values}], values one per attribute (List as an array, others a string)
  entries jsonb not null,
  -- The practice game's secret pet: Ati, else the first pet
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
  select e.id, e.name, e.photo_url
  from entries e join game g on g.id = e.game_id
  where e.deleted_at is null
),
cells as (
  select p.id as entry_id, a.n,
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
      'photo', p.photo_url,
      'values', coalesce((select jsonb_agg(c.value order by c.n) from cells c where c.entry_id = p.id),
        '[]'::jsonb)
    ) order by lower(p.name), p.id) from pets p),
  coalesce((select id from pets where name = 'Ati' order by id limit 1),
    (select id from pets order by lower(name), id limit 1))
where exists (select 1 from pets);

-- The photo URLs the tutorial uses, for upload reference checks
create view tutorial_photos as
select e ->> 'photo' as url from tutorial, jsonb_array_elements(entries) e;
