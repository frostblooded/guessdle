-- Zoom games (ADR 0019): players guess an entry from zoomed-in square parts of its image.
-- A game's kind is chosen at creation and never changes; zoom_parts is a Zoom game's part
-- count, which is also its number of tries.
alter table games add column kind text not null default 'classic'
  check (kind in ('classic', 'zoom'));
alter table games add column zoom_parts integer not null default 5
  check (zoom_parts between 1 and 6);

-- A part is a square in the entry photo's own pixels, closest zoom first (position 0)
create table entry_zoom_parts (
  entry_id bigint not null references entries (id) on delete cascade,
  position integer not null check (position >= 0),
  x integer not null check (x >= 0),
  y integer not null check (y >= 0),
  size integer not null check (size > 0),
  primary key (entry_id, position)
);
