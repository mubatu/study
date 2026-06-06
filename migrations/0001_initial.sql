PRAGMA foreign_keys = ON;

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  name_key TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  created_at_ms INTEGER NOT NULL
);

CREATE TABLE study_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  started_at_ms INTEGER NOT NULL,
  ended_at_ms INTEGER,
  created_at_ms INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CHECK (ended_at_ms IS NULL OR ended_at_ms >= started_at_ms)
);

CREATE UNIQUE INDEX one_open_session_per_user
  ON study_sessions(user_id)
  WHERE ended_at_ms IS NULL;

CREATE INDEX study_sessions_user_time
  ON study_sessions(user_id, started_at_ms, ended_at_ms);
