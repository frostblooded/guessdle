-- Counts how often a day's answer changed after players could see it (an override or a
-- cleared override on today). Each change wipes that day's guesses, give-ups and results;
-- browsers compare it with the revision they played on and start their board over.
alter table daily_answers add column revision int not null default 0;
