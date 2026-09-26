-- Email and password sign-in: the links that prove an address (D109).
--
-- A password account is never created unverified. Registering stores the password's hash HERE,
-- on the token, and the `users` row is written only when the emailed link comes back — so every
-- row in `users` has an address someone has proved they read, and the Google join rule in
-- users.ts can keep trusting it.
--
-- `id` is the SHA-256 of the token, never the token: the link is a bearer credential, the same
-- as the session cookie, and a leaked copy of this table must not be replayable.
--
-- `email` is not a foreign key. A `verify` token names an address that has no account yet,
-- and a `reset` token outliving its account is harmless — it finds no user and fails.

CREATE TABLE email_tokens (
  id            TEXT PRIMARY KEY,
  purpose       TEXT NOT NULL CHECK (purpose IN ('verify', 'reset')),
  email         TEXT NOT NULL,
  -- The hash to install when a `verify` token is used. NULL for `reset`, whose new password
  -- arrives with the token instead.
  password_hash TEXT,
  created_at    INTEGER NOT NULL,
  expires_at    INTEGER NOT NULL
);

CREATE INDEX email_tokens_email ON email_tokens(email, purpose);
CREATE INDEX email_tokens_expires_at ON email_tokens(expires_at);
