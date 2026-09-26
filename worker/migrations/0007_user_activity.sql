-- When an account last signed in, and when it was last used (D108).
--
-- Both could be read off `sessions` — `created_at` is a sign-in, and `expires_at` minus the
-- TTL is the last renewal — but session rows are deleted on sign-out and on expiry, so an
-- account whose session has gone would read as never having signed in at all. The columns
-- keep the answer after the row that produced it is gone.
--
-- `last_seen_at` is written alongside the sliding renewal, so it is accurate to a day and
-- costs one more row write per session per day, well inside the free tier's 100k.
--
-- ADD COLUMN, nullable: an account nobody has signed in to since this migration has no
-- answer, and NULL says that rather than a made-up date.

ALTER TABLE users ADD COLUMN last_login_at INTEGER;
ALTER TABLE users ADD COLUMN last_seen_at INTEGER;

-- Backfilled from whatever sessions survive. 2592000 is SESSION_TTL_S: a session's expiry
-- minus its lifetime is when it was last renewed, or issued if it never was.
UPDATE users SET
  last_login_at = (SELECT MAX(s.created_at) FROM sessions s WHERE s.user_id = users.id),
  last_seen_at  = (SELECT MAX(s.expires_at - 2592000) FROM sessions s WHERE s.user_id = users.id);
