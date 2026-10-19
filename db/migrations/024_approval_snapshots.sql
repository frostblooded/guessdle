-- The game as an admin last approved it (ADR 0022), so the next review shows what changed.
-- Null until the first approval; games approved before this get one before their first edit.
alter table games add column approved_snapshot jsonb;
