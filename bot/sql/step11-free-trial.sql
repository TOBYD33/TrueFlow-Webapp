-- Feature 3 — 14-day free_trial -> free tier transition.
-- trial_ends_at is only ever set at org creation (bot/src/user-service.ts,
-- web/app/api/auth/signup/route.ts) and read by the daily scheduled job
-- bot/src/trial-service.ts (expireTrials). Existing orgs (already on
-- 'free' or a real paid plan) are untouched — this column stays null for
-- them, which is fine since the job only ever looks at plan = 'free_trial'.
alter table organizations add column if not exists trial_ends_at timestamptz;
