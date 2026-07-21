-- Step 7 — Run this entire block in Supabase SQL Editor (safe to re-run)
--
-- Client birthdays — month/day required, year optional (deliberately never
-- required; many users won't want to share a business contact's age).
-- Stored as separate int columns rather than a date, since a plain `date`
-- column can't represent "no year" and Feb 29 needs graceful handling in
-- non-leap years — both are simpler as plain integers than fighting a
-- date type that assumes a real calendar year exists.

alter table clients
  add column if not exists birthday_month smallint,
  add column if not exists birthday_day smallint,
  add column if not exists birthday_year smallint;
