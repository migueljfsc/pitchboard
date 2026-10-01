-- How much the site is used by everybody, not only by accounts (D119).
--
-- Accounts are optional, so `users` sees a fraction of the traffic. This counts what anyone
-- does — a page opened, an export finished, a link made — as one number per UTC day and
-- event. Nothing here names a person: no user, no session, no address, no board. The table
-- therefore stays off `deleteAccount`'s list (D110).
--
-- One row per day and event, bumped in place, so a day costs a few dozen rows however busy it
-- is. The Worker caps each row, and a capped bump writes nothing.

CREATE TABLE usage_daily (
  day   TEXT    NOT NULL,              -- 'YYYY-MM-DD', UTC
  event TEXT    NOT NULL,              -- one of USAGE_EVENTS in worker/lib/usage.ts
  n     INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, event)
) WITHOUT ROWID;
