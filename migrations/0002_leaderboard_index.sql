CREATE INDEX study_sessions_time
  ON study_sessions(started_at_ms, ended_at_ms);
