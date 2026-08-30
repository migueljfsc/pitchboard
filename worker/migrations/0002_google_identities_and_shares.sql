-- Google as the primary sign-in, password retained, and friendly share links (D39, D41).
--
-- SAFETY. Two tables are dropped and rebuilt rather than altered, because SQLite cannot relax
-- a NOT NULL constraint or change a foreign key action in place. That is only acceptable
-- because every table here is EMPTY — 0001 has been applied but no account has ever been
-- created. Re-running this shape against populated tables would destroy data. If that is ever
-- true, the twelve-step procedure (copy to a new table, drop, rename) is the only correct form.
--
-- Dropping a parent and recreating it under the same name does not orphan the children:
-- SQLite resolves foreign keys by table name at DML time, not at schema-definition time, so
-- sessions, projects and boards keep pointing at the new `users`.

-- ---------------------------------------------------------------------------
-- users — password_hash becomes nullable
-- ---------------------------------------------------------------------------
-- A Google-only account has no password and never will. The alternative to nullable was a
-- sentinel value, which every verification path would then have to remember to reject.

DROP TABLE users;

CREATE TABLE users (
  id            TEXT PRIMARY KEY,
  -- Still lowercased by the application, still UNIQUE only because of that.
  -- It is also the join key between sign-in methods: signing in with Google using the address
  -- of an existing password account attaches an identity to that user rather than making a
  -- second one. Two accounts for one person is the failure mode worth designing out.
  email         TEXT NOT NULL UNIQUE,
  -- NULL for accounts that only ever use an external identity provider.
  password_hash TEXT,
  display_name  TEXT,
  created_at    INTEGER NOT NULL
);

-- ---------------------------------------------------------------------------
-- identities — external sign-in providers
-- ---------------------------------------------------------------------------
-- Keyed on the provider's subject, never on the email: a Google account's address can change
-- and its `sub` cannot. Storing the email as the key would silently split an account in two
-- the day someone renames their Google address.

CREATE TABLE identities (
  provider   TEXT NOT NULL,
  subject    TEXT NOT NULL,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (provider, subject)
);

CREATE INDEX identities_user_id ON identities(user_id);

-- ---------------------------------------------------------------------------
-- snapshots — deleting an account now takes the published copies with it
-- ---------------------------------------------------------------------------
-- board_id stays ON DELETE SET NULL: deleting one board leaves links published from it alive,
-- which is what 0001 wanted. user_id becomes ON DELETE CASCADE, because the privacy policy
-- promises that deleting an ACCOUNT destroys everything, share links included. The two deletes
-- are deliberately different and the FK actions are where that difference is enforced.

DROP TABLE snapshots;

CREATE TABLE snapshots (
  id         TEXT PRIMARY KEY,
  board_id   TEXT REFERENCES boards(id) ON DELETE SET NULL,
  user_id    TEXT REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL
);

CREATE INDEX snapshots_board_id ON snapshots(board_id);
CREATE INDEX snapshots_user_id ON snapshots(user_id);

-- ---------------------------------------------------------------------------
-- boards — a friendly, stable share address
-- ---------------------------------------------------------------------------
-- The slug addresses the board; published_snapshot_id says which frozen copy it currently
-- resolves to. Republishing re-aims the slug and leaves every previous snapshot intact and
-- individually addressable, so the link stays short and stable without any snapshot becoming
-- mutable. Anonymous `#d=` links are untouched by all of this and remain self-contained.
--
-- Both columns are added rather than rebuilt: SQLite permits ADD COLUMN with a REFERENCES
-- clause precisely because the default is NULL.

ALTER TABLE boards ADD COLUMN share_slug TEXT;
ALTER TABLE boards ADD COLUMN published_snapshot_id TEXT REFERENCES snapshots(id) ON DELETE SET NULL;

-- Partial, so the many unpublished boards do not collide on NULL and the index stays small.
CREATE UNIQUE INDEX boards_share_slug ON boards(share_slug) WHERE share_slug IS NOT NULL;
