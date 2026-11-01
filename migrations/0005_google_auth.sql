ALTER TABLE users ADD COLUMN google_sub TEXT;
ALTER TABLE users ADD COLUMN email TEXT;

CREATE UNIQUE INDEX users_google_sub
  ON users(google_sub)
  WHERE google_sub IS NOT NULL;

CREATE INDEX users_unlinked_email
  ON users(email)
  WHERE google_sub IS NULL AND email IS NOT NULL;

CREATE TABLE auth_sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  created_at_ms INTEGER NOT NULL,
  expires_at_ms INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX auth_sessions_user
  ON auth_sessions(user_id, expires_at_ms);
