-- Every project lives under a sport (D114).
--
-- A board has a sport (D113), and the library is filed by it: one folder per sport at the
-- root, which the account cannot delete, rename or move, and under which every other folder
-- sits. A basketball board lives under Basketball and nowhere else.
--
-- `sport` is set on those roots only, and NULL on every folder a coach made. The partial
-- unique index is what lets the Worker create a missing root with a plain INSERT and no
-- race: a second tab listing projects at the same moment finds the index, not a duplicate.
--
-- Roots are otherwise created when an account first lists its projects, so a sport added
-- later needs no migration of its own. What this one owes is the folders made BEFORE there
-- were roots: they sat at the root themselves, every board in them was a football board but
-- for a day's worth, and they move under Football — the root is made here for every account
-- that has any. "Templates" moves with them, and is Football's templates from now on.
--
-- Ids are 22 hex characters, which the Worker's route pattern accepts as it does its own
-- base64url ones.

ALTER TABLE projects ADD COLUMN sport TEXT;

CREATE UNIQUE INDEX projects_user_sport ON projects(user_id, sport) WHERE sport IS NOT NULL;

INSERT INTO projects (id, user_id, name, parent_id, sport, created_at, updated_at)
SELECT lower(hex(randomblob(11))), user_id, 'football', NULL, 'football', min(created_at), max(updated_at)
  FROM projects
 GROUP BY user_id;

UPDATE projects
   SET parent_id = (
         SELECT r.id FROM projects r WHERE r.user_id = projects.user_id AND r.sport = 'football'
       )
 WHERE parent_id IS NULL AND sport IS NULL;
