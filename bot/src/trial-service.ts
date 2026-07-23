// trial-service.ts
// Feature 3 — 14-day free_trial -> free tier transition. Run daily by
// scheduler.ts. Never deletes or locks any existing data, only caps
// receipt/client limits going forward for orgs that never upgraded.
//
// FLAGGED — the exact post-trial Free tier caps below are placeholders
// (mirrors web/lib/plans.ts's PLAN_CONFIG.free), not yet product-confirmed.
// Update both copies together if these change.

import { supabase } from './supabase'
import { notifyOwner } from './notification-service'

const FREE_RECEIPT_LIMIT = 10
const FREE_CLIENT_LIMIT = 0

export async function expireTrials(): Promise<void> {
  const nowIso = new Date().toISOString()

  const { data: orgs, error } = await supabase
    .from('organizations')
    .select('id, name, org_members(whatsapp_number, role, profiles(email))')
    .eq('plan', 'free_trial')
    .lt('trial_ends_at', nowIso)

  if (error) { console.error('expireTrials: query failed:', error); return }

  for (const org of orgs || []) {
    try {
      await supabase
        .from('organizations')
        .update({
          plan: 'free',
          receipt_limit: FREE_RECEIPT_LIMIT,
          client_limit: FREE_CLIENT_LIMIT,
        })
        .eq('id', (org as any).id)

      const owner = (org as any).org_members?.find((m: any) => m.role === 'owner')
      if (!owner?.whatsapp_number) continue

      const message =
        `Your 14-day TrueFlow trial has ended, ${(org as any).name} is now on the Free plan.\n\n` +
        `Nothing you've already tracked is affected. Free includes ${FREE_RECEIPT_LIMIT} receipts/month ` +
        `and WhatsApp bot access. Visit app.gettrueflow.com/settings/subscription anytime to unlock ` +
        `unlimited receipts, clients, and more.`

      await notifyOwner({
        whatsappNumber: owner.whatsapp_number,
        ownerEmail: (owner as any)?.profiles?.email,
        message,
        emailSubject: 'Your TrueFlow trial has ended',
      }).catch(err => console.error(`expireTrials: notify failed for org ${(org as any).id}:`, err))
    } catch (err) {
      console.error(`expireTrials: failed for org ${(org as any).id}:`, err)
    }
  }
}
