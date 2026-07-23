-- One-time backfill for the new plan structure (free_trial, free,
-- individual, business, business_pro, enterprise). organizations.plan is
-- plain text (no enum/check constraint), so old values keep working at the
-- DB level, but the app's plan config (web/lib/plans.ts) only recognizes
-- the new names going forward — this remaps existing rows so every org
-- reads correctly without relying on the app's resolvePlan() fallback.
--
-- Reviewed 2026-07-23: only ONE live org was on any deprecated name
-- ("Big Dee", plan = 'sme_starter'), and it has no real Paystack customer/
-- subscription ID attached (paystack_customer_id and paystack_subscription_id
-- are both null despite paystack_subscription_status = 'active') — this is
-- a manual admin-panel test override, not a real paying subscriber, and was
-- explicitly confirmed safe to remap. Every other org is already on 'free'.
--
-- Mapping used (per the ticket): freelancer/sme_starter -> business;
-- agency/sme_pro/studio -> business_pro; family -> individual (the old
-- standalone Family tier folds into Individual + the optional Family
-- add-on, not yet billed separately).

update organizations set plan = 'business'      where plan in ('freelancer', 'sme_starter');
update organizations set plan = 'business_pro'  where plan in ('agency', 'sme_pro', 'studio');
update organizations set plan = 'individual'    where plan = 'family';

-- Verify nothing is left on a deprecated name:
-- select plan, count(*) from organizations group by plan order by plan;
