-- Formations drawn by hand, kept with the account (D122).
--
-- A catalogue formation is a notation, and a board records its name. A hand-drawn one is a set
-- of marks with nowhere else to live, so an account keeps its own: one row per shape, beside the
-- squad presets and built the same way (D30) — `name` as a column, since it is the one part the
-- server bounds, and the shape as an opaque body the browser validates.
--
-- A board that uses one carries a copy on its team, so deleting a row here changes no board.

CREATE TABLE formations (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- What the coach called it — "Our 4-4-2 diamond".
  name       TEXT NOT NULL,
  -- The serialised shape: slots as fractions of the board, units by slot, and its sport.
  body       TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX formations_user_id ON formations(user_id);
