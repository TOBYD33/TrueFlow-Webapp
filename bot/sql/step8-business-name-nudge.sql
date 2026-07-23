-- Tracks whether an org still stuck on the placeholder "My Business" name
-- has already been sent the one-time backfill nudge, so we never ask twice.
alter table organizations add column if not exists business_name_nudge_sent_at timestamptz;
