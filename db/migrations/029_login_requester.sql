-- Who asked for each sign-in link (a hash of the requester's IP), so the hourly mail limit is
-- per requester: one sender filling a site-wide cap could otherwise block every sign-in.
alter table login_tokens add column requester text;
create index login_tokens_requester_created on login_tokens (requester, created_at);
