-- Email magic-link sign-in replaces Google: accounts are keyed by lowercase email.
-- Existing Google users keep their rows (google_sub stays, now optional) and match by email.
alter table users alter column google_sub drop not null;
create unique index users_email_lower on users (lower(email));

-- Only a hash of the emailed token is stored; single use via used_at.
create table login_tokens (
  token_hash text primary key,
  email text not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null
);
create index login_tokens_email_created on login_tokens (email, created_at);
