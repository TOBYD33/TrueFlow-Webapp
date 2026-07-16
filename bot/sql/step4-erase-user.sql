-- Step 4 — Run this entire block in Supabase SQL Editor (safe to re-run)
--
-- PART 1 — Patches the live erase_organization(p_org_id) function.
-- It already correctly handles whatsapp_conversations, whatsapp_sessions,
-- identity_merge_codes, subscription_events, andrea_contributions, and the
-- "only wipe this person's identity if this org is their only one" temp
-- table logic. It never touches impersonation_sessions, admin_audit_log,
-- admin_broadcasts, pending_erasures, or profiles.merged_into_id — all of
-- which are NO ACTION foreign keys into organizations/profiles. That is
-- the exact bug that blocked deleting a test user tonight (they had been
-- impersonated twice, so impersonation_sessions.target_user_id blocked the
-- delete). This means erase_organization is currently broken in production
-- for ANY org or user that has ever been impersonated, appeared in a
-- broadcast, or had a pending erasure logged against it.
--
-- These are history/audit tables, not operational data — the fix is to
-- null the dangling reference (preserving the row itself, e.g. "an admin
-- did X" stays true even after the target is gone), never to delete the
-- audit row outright.
--
-- PART 2 — New erase_user(p_profile_id) function for the "Permanently
-- Erase User" Super Admin action. Finds every organization this profile
-- OWNS (never touches orgs where they're merely staff/family/viewer
-- elsewhere), erases each one via erase_organization() itself so the two
-- functions can never drift apart, then unconditionally wipes the
-- identity: profile, Supabase Auth login, WhatsApp session, and
-- conversation history. Unlike erase_organization's own internal "only if
-- this was their last org" check (which exists so erasing ONE of a
-- multi-org owner's businesses never touches their login), erase_user's
-- final identity wipe always runs — the whole point of this action is to
-- delete the person, not just incidentally catch them as a side effect.

create or replace function public.erase_organization(p_org_id uuid)
returns void
language plpgsql
security definer
as $function$
begin
  create temp table _erase_users on commit drop as
    select m.user_id from org_members m
    where m.org_id = p_org_id and m.user_id is not null
      and not exists (
        select 1 from org_members o
        where o.user_id = m.user_id and o.org_id <> p_org_id
      );

  -- Null out audit/history references to this org BEFORE deleting it —
  -- these rows document that something happened, that fact survives.
  update impersonation_sessions set target_org_id = null where target_org_id = p_org_id;
  update pending_erasures set target_org_id = null where target_org_id = p_org_id;

  -- Null out audit/history references to the users about to be erased —
  -- same reasoning, preserve the log row, drop the dangling pointer.
  update admin_audit_log set admin_id = null where admin_id in (select user_id from _erase_users);
  update admin_broadcasts set sent_by_admin_id = null where sent_by_admin_id in (select user_id from _erase_users);
  update impersonation_sessions set admin_id = null where admin_id in (select user_id from _erase_users);
  update impersonation_sessions set target_user_id = null where target_user_id in (select user_id from _erase_users);
  update pending_erasures set requested_by_admin_id = null where requested_by_admin_id in (select user_id from _erase_users);
  update pending_erasures set cancelled_by_admin_id = null where cancelled_by_admin_id in (select user_id from _erase_users);
  update profiles set merged_into_id = null where merged_into_id in (select user_id from _erase_users);

  delete from whatsapp_conversations where phone_number in
    (select phone from profiles where id in (select user_id from _erase_users) and phone is not null);
  delete from whatsapp_sessions where org_id = p_org_id
    or user_id in (select user_id from _erase_users);
  delete from identity_merge_codes where target_profile_id in (select user_id from _erase_users)
    or requested_by_profile_id in (select user_id from _erase_users);
  delete from subscription_events where org_id = p_org_id;
  delete from andrea_contributions where org_id = p_org_id;

  delete from organizations where id = p_org_id; -- cascades all org-scoped data (receipts, clients, org_members, etc.)

  delete from auth.users where id in (select user_id from _erase_users); -- cascades profiles for users who had a web login
  delete from profiles where id in (select user_id from _erase_users);  -- catches bot-only profiles with no auth.users row
end;
$function$;

create or replace function public.erase_user(p_profile_id uuid)
returns void
language plpgsql
security definer
as $function$
declare
  v_org_id uuid;
  v_phone text;
begin
  -- Erase every organization this profile OWNS — never touches orgs where
  -- they're staff/family/viewer elsewhere. Reuses erase_organization()
  -- exactly, so org-erasure logic never has two diverging copies.
  for v_org_id in
    select org_id from org_members where user_id = p_profile_id and role = 'owner'
  loop
    perform erase_organization(v_org_id);
  end loop;

  -- Capture phone BEFORE deleting the profile row — needed to find their
  -- whatsapp_conversations, which are keyed by phone_number, not user_id.
  select phone into v_phone from profiles where id = p_profile_id;

  -- Unconditional identity wipe — this always runs, regardless of whether
  -- erase_organization's own internal "was this their last org" check
  -- already did it above (e.g. they owned zero orgs, or still had a
  -- leftover staff membership elsewhere at the time each loop iteration
  -- ran). Erase User is a deliberate, standalone action: the person is
  -- being erased because an admin chose to erase THIS person, not as an
  -- incidental side effect of erasing their last business.
  update admin_audit_log set admin_id = null where admin_id = p_profile_id;
  update admin_broadcasts set sent_by_admin_id = null where sent_by_admin_id = p_profile_id;
  update impersonation_sessions set admin_id = null where admin_id = p_profile_id;
  update impersonation_sessions set target_user_id = null where target_user_id = p_profile_id;
  update pending_erasures set requested_by_admin_id = null where requested_by_admin_id = p_profile_id;
  update pending_erasures set cancelled_by_admin_id = null where cancelled_by_admin_id = p_profile_id;
  update profiles set merged_into_id = null where merged_into_id = p_profile_id;

  if v_phone is not null then
    delete from whatsapp_conversations where phone_number = v_phone;
  end if;
  delete from whatsapp_sessions where user_id = p_profile_id;
  delete from identity_merge_codes where target_profile_id = p_profile_id or requested_by_profile_id = p_profile_id;

  -- Safety net: removes any remaining org_members rows (e.g. staff/family
  -- memberships in orgs this person does NOT own — those orgs and their
  -- data are untouched, only this person's own membership row goes away).
  -- org_members.user_id already CASCADEs on profile delete below, this
  -- line is redundant but explicit for readability.
  delete from org_members where user_id = p_profile_id;

  delete from auth.users where id = p_profile_id; -- cascades the profiles row for web-login users
  delete from profiles where id = p_profile_id;   -- catches bot-only profiles with no auth.users row
end;
$function$;
