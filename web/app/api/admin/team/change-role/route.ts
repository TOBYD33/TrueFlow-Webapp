// api/admin/team/change-role/route.ts
// Changes a platform admin's role. Super Admin only. Super role cannot be assigned.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

function getAdmin() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = getAdmin()
  const { data: caller } = await admin
    .from('profiles').select('admin_role, is_super_admin').eq('id', user.id).single()

  const callerRole = caller?.admin_role ?? (caller?.is_super_admin ? 'super' : null)
  if (callerRole !== 'super') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { targetId, newRole } = await req.json()
  if (!targetId || !newRole) return NextResponse.json({ error: 'targetId and newRole required' }, { status: 400 })
  if (newRole === 'super') return NextResponse.json({ error: 'Super Admin cannot be assigned via UI' }, { status: 400 })

  const { data: target } = await admin.from('profiles').select('admin_role').eq('id', targetId).single()
  const oldRole = target?.admin_role

  const { error } = await admin.from('profiles').update({ admin_role: newRole }).eq('id', targetId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await admin.from('admin_audit_log').insert({
    admin_id: user.id,
    action: 'change_admin_role',
    target_table: 'profiles',
    target_id: targetId,
    details: { old_role: oldRole, new_role: newRole },
  })

  return NextResponse.json({ ok: true })
}
