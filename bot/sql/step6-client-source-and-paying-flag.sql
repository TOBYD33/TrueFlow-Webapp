-- Step 6 — Run this entire block in Supabase SQL Editor (safe to re-run)
--
-- Adds the "is this client currently paying?" flag — deliberately
-- independent of status ('lead'/'active'/etc.), since a client can be
-- active but not yet paying. Default false, never touches existing rows'
-- meaning.
--
-- No migration needed for clients.source — confirmed no CHECK constraint
-- restricts its values (it's a plain text column), so the new source
-- options (whatsapp, facebook, instagram, referral, offline, other) work
-- immediately alongside the existing 'manual' | 'business_card' |
-- 'smart_transfer' values without any schema change.

alter table clients
  add column if not exists is_paying boolean not null default false;
