// api/admin/suspend/route.ts
// Sets organizations.status = 'suspended'. Logs to admin_audit_log.
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

export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

    const admin = getAdmin()

    // Verify super admin
    const { data: profile } = await admin.from('profiles').select('is_super_admin').eq('id', user.id).single()
    if (!profile?.is_super_admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { org_id, reason } = await req.json() as { org_id: string; reason?: string }
    if (!org_id) return NextResponse.json({ error: 'org_id required' }, { status: 400 })

    // Get current status for audit
    const { data: org } = await admin.from('organizations').select('name, status, plan').eq('id', org_id).single()

    const { error } = await admin.from('organizations').update({ status: 'suspended' }).eq('id', org_id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    await logAdminAction({
      adminId: user.id,
      action: 'suspend_org',
      targetTable: 'organizations',
      targetId: org_id,
      details: { org_name: org?.name, previous_status: org?.status ?? 'active', reason: reason ?? null },
    })

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('admin/suspend error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
