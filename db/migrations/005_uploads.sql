-- One row per stored upload: who owns the bytes (quota) and when it was made (sweep grace period).
create table uploads (
  name text primary key,
  user_id bigint not null references users (id) on delete cascade,
  bytes integer not null,
  created_at timestamptz not null
);
create index uploads_user_idx on uploads (user_id);
