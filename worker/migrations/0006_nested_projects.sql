-- Projects nest (D51).
--
-- D39 gave a user projects and a project boards, one level deep. A coach with a season's
-- worth of work wants "Season 24/25 > Away games > Set pieces", and a flat list of
-- twenty-five folders is not organisation, it is the same problem with more scrolling.
--
-- An adjacency list: one nullable self-reference, NULL meaning a folder at the root. The
-- alternative shapes — a materialised path, or a closure table — buy fast subtree queries
-- at the cost of a second thing to keep in step on every move. Neither is worth it here:
-- the whole tree is at most twenty-five rows, the client already fetches it whole and
-- derives everything from that one list, and the only queries the server runs against the
-- shape are the two guards below.
--
-- ADD COLUMN, not a rebuild: SQLite permits a REFERENCES clause here precisely because the
-- default is NULL, which is exactly what an existing project should become — every project
-- written before this sits at the root, and no migration of the data itself is owed.
--
-- ON DELETE CASCADE, and it recurses. Deleting a folder takes its subfolders, and each of
-- those takes its boards through the cascade `boards.project_id` already has. The whole
-- delete stays one statement. What that costs is a confirmation that has to be honest about
-- the size of what is going, which is the client's job.

ALTER TABLE projects ADD COLUMN parent_id TEXT REFERENCES projects(id) ON DELETE CASCADE;

-- The tree is walked upward far more often than downward — the depth and cycle guards both
-- climb from a row to the root — but SQLite has no reverse index, so this serves the
-- downward walk and the children-of lookup the rail is built from.
CREATE INDEX projects_parent_id ON projects(parent_id);
