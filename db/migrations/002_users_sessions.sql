-- Accounts keyed by the Google subject (email can change), and server-side sessions.
create table users (
  id bigserial primary key,
  google_sub text not null unique,
  email text not null,
  name text not null,
  admin boolean not null default false,
  created_at timestamptz not null default now(),
  last_seen timestamptz not null default now()
);

-- Only a hash of the cookie token is stored; deleting a row revokes the session.
create table sessions (
  token_hash text primary key,
  user_id bigint not null references users (id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index sessions_user_id on sessions (user_id);
