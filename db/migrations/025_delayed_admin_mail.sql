-- When to mail the admins that a game waits for approval: 5 minutes after it entered pending,
-- so a game an admin approves or rejects right away sends no email. Null once mailed or decided.
alter table games add column admin_mail_at timestamptz;
