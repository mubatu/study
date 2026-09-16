CREATE TABLE study_adjustments (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  study_date TEXT NOT NULL,
  delta_seconds INTEGER NOT NULL,
  session_delta INTEGER NOT NULL CHECK (session_delta IN (-1, 1)),
  created_at_ms INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX study_adjustments_user_date
  ON study_adjustments(user_id, study_date);

CREATE INDEX study_adjustments_date
  ON study_adjustments(study_date, user_id);
