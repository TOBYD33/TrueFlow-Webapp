// api/admin/reactivate/route.ts
// Sets organizations.status = 'active'. Logs to admin_audit_log.
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

    const { data: profile } = await admin.from('profiles').select('is_super_admin').eq('id', user.id).single()
    if (!profile?.is_super_admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { org_id } = await req.json() as { org_id: string }
    if (!org_id) return NextResponse.json({ error: 'org_id required' }, { status: 400 })

    const { data: org } = await admin.from('organizations').select('name, status').eq('id', org_id).single()

    const { error } = await admin.from('organizations').update({ status: 'active' }).eq('id', org_id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    await logAdminAction({
      adminId: user.id,
      action: 'reactivate_org',
      targetTable: 'organizations',
      targetId: org_id,
      details: { org_name: org?.name, previous_status: org?.status ?? 'suspended' },
    })

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('admin/reactivate error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
