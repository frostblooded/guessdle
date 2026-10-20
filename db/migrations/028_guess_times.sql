-- When each signed-in guess was made, so the server times a win from the board's first guess
-- to the winning one and every device shows the same time. Guesses from before this, and
-- guest guesses moved to the account on sign-in, have none: the browser's clock times those.
alter table user_guesses add column guessed_at timestamptz;
alter table user_guesses alter column guessed_at set default now();
