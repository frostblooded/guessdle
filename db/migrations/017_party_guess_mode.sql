-- How every player in a party picks a guess: typing with autocomplete or selecting from the list
-- of entries. The host chooses when opening the party; it stays fixed for the party.
alter table parties add column guess_mode text not null default 'type'
  check (guess_mode in ('type', 'select'));
