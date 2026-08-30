-- A board link follows the board, so snapshots have nothing left to do.
--
-- 0002 and 0003 built /s/<slug> on immutable snapshots: publishing froze a copy and the slug
-- re-aimed at it. That was D39's split between mutable boards and immutable published copies,
-- and it turned out to be the wrong half of the trade. What people want from a link to a board
-- they own is that reloading it shows the current state — otherwise "share" means "share, then
-- remember to republish", and the reader is looking at something stale with no way to tell.
--
-- Immutability did not go anywhere; it moved to where it was always better served. The
-- anonymous `#d=` link CARRIES the whole board in the URL (D33), so it is frozen by
-- construction, needs no server, and cannot rot. The two mechanisms now say something
-- different rather than nearly the same thing:
--
--   #d=<board>    a frozen copy, forever, no account, never reaches the server
--   /s/<slug>     a live pointer, for as long as the board exists
--
-- So `share_slug` is the whole of publishing now, and the read comes from `boards.doc`.
-- Snapshots are dropped rather than left unread: nothing writes them, nothing reads them, and
-- an empty table with a foreign key into `boards` is a trap for whoever meets it next.

DROP INDEX IF EXISTS snapshots_board_id;
DROP INDEX IF EXISTS snapshots_user_id;
DROP TABLE IF EXISTS snapshots;

ALTER TABLE boards DROP COLUMN published_snapshot_id;
