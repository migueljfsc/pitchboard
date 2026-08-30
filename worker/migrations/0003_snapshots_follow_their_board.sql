-- Deleting a board withdraws the links published from it (D39, amended).
--
-- 0001 gave snapshots ON DELETE SET NULL so a share link could outlive its board. That never
-- became true: `share_slug` lives on the BOARD row, so deleting a board already destroyed the
-- only path to its snapshots. All SET NULL achieved was leaving rows nothing could reach and
-- nothing would ever collect — and it made the privacy policy wrong, which promised that
-- deleting one board left its published link alone.
--
-- Delete now means delete. The alternative was moving the slug onto the snapshot so links
-- really did survive, which is defensible but surprising: people expect a deleted board to
-- stop being readable by anyone holding an old link.
--
-- The KV bodies are removed by the Worker before the row goes, since a foreign key cannot
-- reach into a key-value store.

CREATE TABLE snapshots_new (
  id         TEXT PRIMARY KEY,
  board_id   TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  user_id    TEXT REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL
);

-- Rows already orphaned are dropped rather than carried: NOT NULL has nowhere to put them,
-- and by construction nothing can reach them.
INSERT INTO snapshots_new (id, board_id, user_id, created_at)
SELECT id, board_id, user_id, created_at FROM snapshots WHERE board_id IS NOT NULL;

DROP TABLE snapshots;

ALTER TABLE snapshots_new RENAME TO snapshots;

CREATE INDEX snapshots_board_id ON snapshots(board_id);
CREATE INDEX snapshots_user_id ON snapshots(user_id);
