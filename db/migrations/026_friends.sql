-- Friends: a request from one player to another, pending until the other accepts it
-- (accepted_at set). One row per pair whichever way it was sent; deleting it declines,
-- cancels or unfriends.
create table friendships (
  requester_id bigint not null references users (id) on delete cascade,
  addressee_id bigint not null references users (id) on delete cascade,
  created_at timestamptz not null,
  accepted_at timestamptz,
  primary key (requester_id, addressee_id),
  check (requester_id <> addressee_id)
);
create unique index friendships_pair
  on friendships (least(requester_id, addressee_id), greatest(requester_id, addressee_id));
create index friendships_addressee on friendships (addressee_id);

-- The email a player gets when someone sends them a friend request; a Settings switch
alter table users add column mail_friend_requests boolean not null default true;
