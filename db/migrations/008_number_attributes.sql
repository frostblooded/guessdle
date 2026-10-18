-- Number attributes: graded with a higher or lower hint. Values stay text, like the others.
alter table attributes drop constraint attributes_type_check;
alter table attributes add constraint attributes_type_check
  check (type in ('text', 'list', 'number'));
