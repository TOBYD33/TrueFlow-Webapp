// api/admin/team/invite/route.ts
// Grants platform admin role to a TrueFlio user by phone number.
// Super Admin only. Super role cannot be assigned here.

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
    .from('profiles')
    .select('admin_role, is_super_admin')
    .eq('id', user.id)
    .single()

  const callerRole = caller?.admin_role ?? (caller?.is_super_admin ? 'super' : null)
  if (callerRole !== 'super') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { phone, role } = await req.json()
  if (!phone || !role) return NextResponse.json({ error: 'phone and role required' }, { status: 400 })

  // Super cannot be assigned via UI
  if (role === 'super') return NextResponse.json({ error: 'Super Admin cannot be assigned via UI' }, { status: 400 })

  const validRoles = ['support', 'finance', 'readonly']
  if (!validRoles.includes(role)) return NextResponse.json({ error: 'Invalid role' }, { status: 400 })

  // Find profile by phone
  const { data: target } = await admin
    .from('profiles')
    .select('id, full_name')
    .eq('phone', phone)
    .single()

  if (!target) return NextResponse.json({ error: 'No TrueFlio account found for that phone number' }, { status: 404 })

  const { error } = await admin
    .from('profiles')
    .update({ admin_role: role })
    .eq('id', target.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await admin.from('admin_audit_log').insert({
    admin_id: user.id,
    action: 'grant_admin_role',
    target_table: 'profiles',
    target_id: target.id,
    details: { role, phone },
  })

  return NextResponse.json({ ok: true })
}
