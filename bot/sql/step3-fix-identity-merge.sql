-- Step 3 — Run this entire block in Supabase SQL Editor (safe to re-run)
--
-- Fixes perform_identity_merge(): the live version of this function was
-- reassigning profiles.merged_into_id/status and whatsapp_sessions.user_id
-- correctly on a Cross-Channel Identity Merge, but never touched
-- org_members.user_id. That silently stranded the merged-away user's org
-- membership behind an identity that nothing (web session, RLS, org
-- lookups) resolves to anymore -- the org and its data still existed, the
-- web app just could never find it, producing a permanent "Loading..."
-- state on Clients/Income/Invoices for every account that went through a
-- merge. Confirmed and repaired for the 2 affected accounts found in
-- production; this migration fixes it going forward. (bot/src/merge-service.ts
-- and web/app/api/link-whatsapp/verify/route.ts also now self-heal any
-- stranded org_members row after calling this function, as a second
-- safety net independent of this SQL actually being run.)
--
-- Behavior otherwise unchanged: earliest created_at wins as primary,
-- org_members duplicates in the same org are soft-removed via removed_at
-- rather than causing a unique-constraint error, secondary profile is
-- soft-marked via merged_into_id/status, never hard-deleted.

create or replace function perform_identity_merge(profile_a uuid, profile_b uuid)
returns uuid
language plpgsql
security definer
as $$
declare
  v_primary uuid;
  v_secondary uuid;
  v_a_created timestamptz;
  v_b_created timestamptz;
  v_primary_phone text;
  v_secondary_phone text;
  v_existing_member uuid;
  r record;
begin
  select created_at into v_a_created from profiles where id = profile_a;
  select created_at into v_b_created from profiles where id = profile_b;

  if v_a_created is null or v_b_created is null then
    raise exception 'perform_identity_merge: one or both profiles not found';
  end if;

  if v_a_created <= v_b_created then
    v_primary := profile_a;
    v_secondary := profile_b;
  else
    v_primary := profile_b;
    v_secondary := profile_a;
  end if;

  -- Reassign org memberships from secondary to primary. If the primary is
  -- already a member of the same org, soft-remove the secondary's row
  -- instead of reassigning (org_members has a unique(org_id, user_id)).
  for r in select id, org_id from org_members where user_id = v_secondary loop
    select id into v_existing_member
      from org_members
      where org_id = r.org_id and user_id = v_primary
      limit 1;

    if v_existing_member is not null then
      update org_members set removed_at = now() where id = r.id;
    else
      update org_members set user_id = v_primary where id = r.id;
    end if;
  end loop;

  -- Reassign WhatsApp sessions
  update whatsapp_sessions set user_id = v_primary where user_id = v_secondary;

  -- Copy the missing identity field onto the primary (phone lives on
  -- profiles; email lives in auth.users and resolves via merged_into_id)
  select phone into v_primary_phone from profiles where id = v_primary;
  select phone into v_secondary_phone from profiles where id = v_secondary;
  if v_primary_phone is null and v_secondary_phone is not null then
    update profiles set phone = v_secondary_phone where id = v_primary;
  end if;

  -- Soft-mark the secondary -- never hard delete
  update profiles set merged_into_id = v_primary, status = 'merged' where id = v_secondary;

  return v_primary;
end;
$$;
