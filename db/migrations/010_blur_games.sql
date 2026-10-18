-- Blur games (ADR 0019): players guess an entry from its square image split into a 3x3 grid,
-- every square blurred but the first; each wrong guess clears the next one. A game's kind is
-- chosen at creation and never changes; blur_tries is a Blur game's number of tries.
alter table games add column kind text not null default 'classic'
  check (kind in ('classic', 'blur'));
alter table games add column blur_tries integer not null default 9
  check (blur_tries between 1 and 9);

-- The order the owner picked for the grid's squares to clear: cell numbers 0-8, row by row
-- from the top left, first cleared first. Null until picked.
alter table entries add column blur_order smallint[]
  check (blur_order is null or cardinality(blur_order) = 9);
