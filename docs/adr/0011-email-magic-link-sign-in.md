# 0011: Email magic-link sign-in replaces Google

Supersedes the Google OAuth parts of ADR 0009 (Auth bullet: Google subject keys, Passport, email-verified Google accounts). Everything else there stands: opaque cookie sessions with a hashed token, JSON-only and Origin-guarded mutating routes, `ADMIN_EMAILS` promotion that never demotes. Google sign-in was removed entirely (no `passport`, no `GOOGLE_*` keys, no OAuth state cookie).

## Flow

1. `POST /api/auth/email/request {email}`: trims, lowercases, shape- and length-checks the address (400 `invalid_email` for garbage, which reveals nothing). Otherwise always answers 200 `{ok:true}` and never looks the user up, so accounts cannot be enumerated. It mails `${PUBLIC_URL}/verify?token=<token>` (ADR 0012; it was `/?login=` before the multi-page redesign, so links mailed before that deploy stop working): 32 random bytes, only the SHA-256 stored (`login_tokens`), valid 15 minutes.
2. The `/verify` page strips `?token=` from the URL (once the token is spent or refused; a network or rate-limit failure keeps it so the player can retry) and calls `POST /api/auth/email/verify {token}`. This is a POST on purpose: a mail scanner that prefetches the link with GET changes nothing. The token is consumed by one `update ... where used_at is null and expires_at > now returning email`, so it works once even under concurrent attempts. Bad, expired or used tokens get 400 `invalid_token`.
3. The user is found or created by lowercase email (unique index `users_email_lower`) and the normal session cookie starts. Existing Google users keep their rows (`google_sub` is now nullable and unused) and match by email on their first email sign-in.

## Abuse limits

Per address: 1 mail a minute and 5 an hour, counted in `login_tokens`; over the limit the answer is still 200 but nothing is sent. Plus the per-IP Express limiter and the tighter nginx `/api/auth/email*` location. Expired tokens are purged on later requests.

## Mail

`nodemailer` over SMTP behind a one-method `Mailer` (`src/server/mailer.ts`) so tests inject a fake. Keys: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`, `SMTP_SECURE`, `PUBLIC_URL`; without `SMTP_HOST` and `PUBLIC_URL` the request route answers 503 `login_unavailable`. STARTTLS is required except toward a local dev inbox. Dev uses a Mailpit container (inbox on http://localhost:8025); production sends through a dedicated Gmail account with an App Password. Mail is plain text with no tracking.

## Consequences

- Deliverability is an operational requirement: the sending domain needs SPF and DKIM (Gmail sending as itself has them; a custom domain must publish its own), or links land in spam and nobody can sign in. Gmail caps about 500 recipients a day.
- Whoever controls an inbox controls the account; there is no password to leak or reset.
- A mail outage means no new sign-ins (existing sessions keep working; anonymous play is unaffected).
