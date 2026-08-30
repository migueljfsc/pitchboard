-- Initial schema for accounts, projects and boards (D39).
--
-- Mutable state only. Published snapshots are immutable and their documents live in KV;
-- the row here exists so a snapshot can be listed and attributed, and it deliberately
-- outlives the board it came from (ON DELETE SET NULL) — a shared link keeps working
-- after the author deletes the board behind it.
--
-- Timestamps are unix epoch seconds (INTEGER), not TEXT: SQLite has no date type and
-- comparing ISO strings works right up until it doesn't.

CREATE TABLE users (
  id            TEXT PRIMARY KEY,
  -- Stored lowercased by the application. SQLite has no case-insensitive text type, so
  -- UNIQUE here only holds if every write normalises first.
  email         TEXT NOT NULL UNIQUE,
  -- PBKDF2-HMAC-SHA256. The salt, iteration count and digest are encoded into this one
  -- string so the work factor can be raised later without a migration: an old row keeps
  -- verifying against its own parameters and is rewritten on the owner's next login.
  password_hash TEXT NOT NULL,
  display_name  TEXT,
  created_at    INTEGER NOT NULL
);

CREATE TABLE sessions (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE INDEX sessions_user_id ON sessions(user_id);
CREATE INDEX sessions_expires_at ON sessions(expires_at);

CREATE TABLE projects (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX projects_user_id ON projects(user_id);

CREATE TABLE boards (
  id         TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  -- The serialised BoardDoc. One row regardless of size — D1 bills per row, not per byte.
  doc        TEXT NOT NULL,
  -- Optimistic concurrency: a write carries the version it read and is refused with 409
  -- if it no longer matches. Two tabs on one board otherwise lose an edit in silence.
  version    INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX boards_project_id ON boards(project_id);
CREATE INDEX boards_user_id ON boards(user_id);

CREATE TABLE snapshots (
  id         TEXT PRIMARY KEY,
  board_id   TEXT REFERENCES boards(id) ON DELETE SET NULL,
  user_id    TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX snapshots_board_id ON snapshots(board_id);
