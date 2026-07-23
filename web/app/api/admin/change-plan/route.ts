// api/admin/change-plan/route.ts
// Manually overrides organizations.plan. Logs old + new plan to admin_audit_log.
// Requires is_super_admin = true.

import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase-server'
import { createClient } from '@supabase/supabase-js'
import { logAdminAction } from '@/lib/admin-audit'
import { PLAN_CONFIG, PlanId } from '@/lib/plans'

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// This is the only place a plan can be manually assigned to a deprecated
// name — it can't, on purpose. Enterprise IS assignable here since this
// endpoint (not self-serve checkout) is its only assignment path.
const VALID_PLANS = Object.keys(PLAN_CONFIG) as PlanId[]

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
    if (!VALID_PLANS.includes(new_plan as PlanId)) return NextResponse.json({ error: 'Invalid plan' }, { status: 400 })

    const { data: org } = await admin.from('organizations').select('name, plan').eq('id', org_id).single()
    const oldPlan = org?.plan ?? 'unknown'

    const newConfig = PLAN_CONFIG[new_plan as PlanId]
    const { error } = await admin.from('organizations').update({
      plan: new_plan,
      receipt_limit: newConfig.scanLimit,
      client_limit: newConfig.clientLimit,
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
