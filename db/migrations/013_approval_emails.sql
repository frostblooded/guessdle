-- Approval emails to a game's owner, set on the Settings page: a master switch and one per
-- kind (approved, rejected, sent back for review). All on by default; the master switch off
-- stops every kind without changing them.
alter table users add column mail_approval boolean not null default true;
alter table users add column mail_approved boolean not null default true;
alter table users add column mail_rejected boolean not null default true;
alter table users add column mail_review boolean not null default true;
