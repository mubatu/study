-- A study session runs from Start to Stop and can be paused and resumed in
-- between. Each continuous stretch is one study_sessions row; run_id groups the
-- stretches of one session, so a session with breaks still counts as one.
ALTER TABLE study_sessions ADD COLUMN run_id TEXT;
-- Timer time the session had already counted before this stretch began.
ALTER TABLE study_sessions ADD COLUMN carried_ms INTEGER NOT NULL DEFAULT 0;

-- Every earlier row was a whole session on its own.
UPDATE study_sessions SET run_id = id WHERE run_id IS NULL;

-- Set while the user's session is paused: which session, the frozen timer
-- value, and when the pause began. All three are cleared on Resume or Stop.
ALTER TABLE users ADD COLUMN paused_run_id TEXT;
ALTER TABLE users ADD COLUMN paused_elapsed_ms INTEGER;
ALTER TABLE users ADD COLUMN paused_at_ms INTEGER;
