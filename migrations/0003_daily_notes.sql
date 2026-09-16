CREATE TABLE daily_notes (
  user_id TEXT NOT NULL,
  study_date TEXT NOT NULL,
  note TEXT NOT NULL,
  updated_at_ms INTEGER NOT NULL,
  PRIMARY KEY (user_id, study_date),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CHECK (length(note) BETWEEN 1 AND 240)
);
