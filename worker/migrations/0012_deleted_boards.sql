-- Deleted boards, kept for TRASH_KEEP_DAYS so a delete can be undone (D127).
--
-- Filled by the trigger below, so every way a board leaves `boards` lands here: one board, a
-- selection, or a folder whose cascade takes its subtree. No statement that deletes a board
-- names this table.
--
-- No foreign keys: a board outlives the folder it was deleted with, and is restored into its
-- sport's root when that folder is gone. The share slug is not kept, so a deleted board's public
-- link stays dead after a restore. `eraseAccount` empties a user's rows here last, after the
-- deletes that fill it; the daily sweep removes rows past their keep (D120).

CREATE TABLE deleted_boards (
  id         TEXT PRIMARY KEY,
  -- Where it was filed. May name a folder that no longer exists.
  project_id TEXT NOT NULL,
  user_id    TEXT NOT NULL,
  name       TEXT NOT NULL,
  doc        TEXT NOT NULL,
  version    INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER NOT NULL
);

CREATE INDEX deleted_boards_user_id ON deleted_boards(user_id, deleted_at);
CREATE INDEX deleted_boards_deleted_at ON deleted_boards(deleted_at);

-- Fires for cascaded deletes too: a folder's boards go through here on their way out.
CREATE TRIGGER boards_into_trash BEFORE DELETE ON boards
BEGIN
  INSERT OR REPLACE INTO deleted_boards
    (id, project_id, user_id, name, doc, version, created_at, updated_at, deleted_at)
  VALUES
    (OLD.id, OLD.project_id, OLD.user_id, OLD.name, OLD.doc, OLD.version, OLD.created_at,
     OLD.updated_at, CAST(strftime('%s', 'now') AS INTEGER));
END;
