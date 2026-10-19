-- Quiz games (ADR 0021): the owner writes questions, each one an entry (its text in name, an
-- optional picture in photo_url) with a spec in quiz: {"options": [...], "correct": n} for
-- multiple choice, or {"answer": "12.5", "range": "5"} for a number scored by closeness.
alter table games drop constraint games_kind_check;
alter table games add constraint games_kind_check check (kind in ('classic', 'blur', 'sequence', 'quiz'));
alter table entries add column quiz jsonb;

-- Each player's first score on a quiz, the one its stats count. `player` is "user:<id>" or
-- "anon:<token>" as in game_results; `score` is 0 up to the questions the quiz had then.
create table quiz_results (
  game_id bigint not null references games (id) on delete cascade,
  player text not null,
  score numeric(8, 2) not null check (score >= 0),
  seconds int check (seconds >= 0),
  created_at timestamptz not null,
  primary key (game_id, player)
);

-- A party round of a Quiz game is one question (party_rounds.answer_entry_id); each player
-- answers it once
create table party_quiz_answers (
  round_id bigint not null references party_rounds (id) on delete cascade,
  player_id bigint not null references party_players (id) on delete cascade,
  answer text not null,
  answered_at timestamptz not null,
  primary key (round_id, player_id)
);
