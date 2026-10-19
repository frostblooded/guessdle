-- Free Hints reveal only an attribute now; an Entry's description shows only with the answer.
-- Hints already taken as a description are dropped, so those players may take an attribute.
delete from user_hints where kind = 'description';
delete from party_hints where kind = 'description';

alter table user_hints
  drop constraint user_hints_kind_check,
  add constraint user_hints_kind_check check (kind = 'attribute'),
  alter column attribute set not null;

alter table party_hints
  drop constraint party_hints_kind_check,
  add constraint party_hints_kind_check check (kind = 'attribute'),
  alter column attribute set not null;
