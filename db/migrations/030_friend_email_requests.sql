-- Friend requests sent by email. The sender always hears "sent", so a request to an email
-- with no account (or a banned one) waits here as pending and is never delivered: answering
-- otherwise told anyone signed in whether an email has an account. addressee_id is the account
-- the email named when it was sent, null when none; that account sees the request as incoming.
-- Declining or unfriending sets it back to null, so the sender still sees it pending.
create table friend_email_requests (
  id bigserial primary key,
  requester_id bigint not null references users (id) on delete cascade,
  addressee_id bigint references users (id) on delete set null,
  email text not null,
  created_at timestamptz not null,
  unique (requester_id, email)
);
create index friend_email_requests_addressee on friend_email_requests (addressee_id);
