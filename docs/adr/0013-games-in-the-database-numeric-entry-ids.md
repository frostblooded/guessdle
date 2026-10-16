# Games live in the database; guesses are numeric entry ids

Status: accepted. Supersedes the pet-id wording of ADR 0010.

Petdle's roster moved from code to Postgres (`games`, `attributes`, `entries`, `entry_values`) so the site can host many games (spec #66). Stored and API guess ids are numeric entry ids (`bigserial`, never reused); the old text slugs were rewritten by migration `005_games.sql` and no legacy id column survives. Entries are soft-deleted (`deleted_at`) so past guesses and answers still resolve. `daily_answers`, `user_guesses` and `user_give_ups` carry a `game_id`; deleting a game cascades through it. Grades are never stored, only guess ids, so a schema edit regrades live. The answer is still never sent before the game ends (ADR 0010).
