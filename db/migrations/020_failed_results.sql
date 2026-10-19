-- A failed first attempt (a give-up, or a Blur game's tries used up) also takes the player's
-- one row for the day, so a win after a reset never counts. Failed rows are not winners:
-- the victory stats leave them out. Their `guesses` may be 0 (a give-up before any guess).
alter table game_results add column won boolean not null default true;
alter table game_results drop constraint game_results_guesses_check;
alter table game_results add constraint game_results_guesses_check check (guesses >= 0);
