-- Answers given in cram mode (reviewing a whole course before an exam). They count as study
-- activity, but don't change when cards are due and are left out of retention.
ALTER TABLE reviews ADD COLUMN cram INTEGER NOT NULL DEFAULT 0;
