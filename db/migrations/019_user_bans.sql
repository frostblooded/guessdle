-- An admin's ban: the player keeps signing in and playing, but cannot create or change games,
-- their games are hidden from everyone but them and admins, and their wins leave the stats.
-- Clearing banned_at restores everything, since nothing else is changed by a ban.
alter table users
  add column banned_at timestamptz,
  add column ban_reason text not null default '';
