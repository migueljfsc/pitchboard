-- Squad presets follow the account, not the browser (D30, D39).
--
-- A preset is a squad, not a board: one team's formation, kit, XI and units, named by the
-- coach and applied onto either side. It shipped in M10 as a `localStorage` library, which
-- made it the BROWSER's library — sign in on a second machine and the squads you spent an
-- evening typing are not there, while every board you saved is. Boards followed the account
-- and squads did not, for no reason anybody chose.
--
-- ONE ROW PER PRESET, not one row per user holding the library as a blob. The editor holds
-- the library in memory for a whole session, so a whole-library write from a second tab
-- always carries a stale list — and deleting somebody's squad because their other tab had
-- not seen it yet is a silent loss with no conflict to detect. A row per preset makes two
-- devices touching two different squads two independent writes.
--
-- `body` is the serialised setup team, stored opaquely and checked only for size and
-- well-formedness — the same division as `boards.doc`. `src/share/presets.ts` owns the
-- schema and validates in the browser, where it has to run anyway: a preset also arrives
-- from `localStorage`, with no server involved (D31).
--
-- `label` is a column rather than a field inside `body` because it is the only part the
-- server has an opinion about: it bounds it, and it is what a listing would order by.

CREATE TABLE presets (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- What the coach called it — "Our first XI". Distinct from the team's own name.
  label      TEXT NOT NULL,
  -- The serialised setup team: formation, kit, players by SHIRT NUMBER, and that side's
  -- units. Never ids — those are minted per board and mean nothing in another one (D30).
  body       TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX presets_user_id ON presets(user_id);
