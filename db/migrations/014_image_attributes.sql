-- Image attributes: an entry's pictures are values like any other (an upload URL, one per
-- entry, may stay blank and is never graded). A classic entry's built-in photo moves into an
-- Image attribute named Photo, first in each classic game's order; Blur games keep their own
-- entry image in photo_url.
alter table attributes drop constraint attributes_type_check;
alter table attributes add constraint attributes_type_check
  check (type in ('text', 'list', 'number', 'image'));

update attributes a set position = a.position + 1
from games g where g.id = a.game_id and g.kind = 'classic';

insert into attributes (game_id, name, type, position)
select g.id,
  case when exists (
    select 1 from attributes t where t.game_id = g.id and lower(t.name) = 'photo'
  ) then 'Entry photo' else 'Photo' end,
  'image', 0
from games g where g.kind = 'classic';

insert into entry_values (entry_id, attribute_id, position, value)
select e.id, a.id, 0, e.photo_url
from entries e
join games g on g.id = e.game_id and g.kind = 'classic'
join attributes a on a.game_id = g.id and a.type = 'image'
where e.photo_url <> '';

update entries e set photo_url = ''
from games g where g.id = e.game_id and g.kind = 'classic';
