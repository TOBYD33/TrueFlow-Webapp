// api/admin/change-plan/route.ts
// Manually overrides organizations.plan. Logs old + new plan to admin_audit_log.
// Requires is_super_admin = true.

import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase-server'
import { createClient } from '@supabase/supabase-js'
import { logAdminAction } from '@/lib/admin-audit'

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

const VALID_PLANS = ['free', 'individual', 'family', 'freelancer', 'sme_starter', 'agency', 'sme_pro', 'studio', 'enterprise']

const PLAN_RECEIPT_LIMITS: Record<string, number> = {
  free: 10, individual: -1, family: -1, freelancer: -1,
  sme_starter: -1, agency: -1, sme_pro: -1, studio: -1, enterprise: -1,
}
const PLAN_CLIENT_LIMITS: Record<string, number> = {
  free: 0, individual: 0, family: 0, freelancer: 10,
  sme_starter: 10, agency: 50, sme_pro: 50, studio: -1, enterprise: -1,
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

    const admin = getAdmin()

    const { data: profile } = await admin.from('profiles').select('is_super_admin').eq('id', user.id).single()
    if (!profile?.is_super_admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { org_id, new_plan, reason } = await req.json() as { org_id: string; new_plan: string; reason?: string }

    if (!org_id || !new_plan) return NextResponse.json({ error: 'org_id and new_plan required' }, { status: 400 })
    if (!VALID_PLANS.includes(new_plan)) return NextResponse.json({ error: 'Invalid plan' }, { status: 400 })

    const { data: org } = await admin.from('organizations').select('name, plan').eq('id', org_id).single()
    const oldPlan = org?.plan ?? 'unknown'

    const { error } = await admin.from('organizations').update({
      plan: new_plan,
      receipt_limit: PLAN_RECEIPT_LIMITS[new_plan] ?? -1,
      client_limit: PLAN_CLIENT_LIMITS[new_plan] ?? 0,
    }).eq('id', org_id)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    await logAdminAction({
      adminId: user.id,
      action: 'change_plan',
      targetTable: 'organizations',
      targetId: org_id,
      details: { org_name: org?.name, old_plan: oldPlan, new_plan, reason: reason ?? null },
    })

    return NextResponse.json({ success: true, old_plan: oldPlan, new_plan })
  } catch (err) {
    console.error('admin/change-plan error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
