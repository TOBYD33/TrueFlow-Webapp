// api/team/permissions/route.ts
// Updates a single permission toggle for an org_members row.

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

const ALLOWED_FIELDS = ['whatsapp_active', 'can_see_clients', 'can_see_income', 'can_export']

export async function PATCH(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = getAdmin()

  const { data: caller } = await admin
    .from('org_members').select('org_id, role').eq('user_id', user.id).is('removed_at', null).single()

  if (!caller || caller.role !== 'owner') {
    return NextResponse.json({ error: 'Forbidden — only Owner can change permissions' }, { status: 403 })
  }

  const { memberId, field, value } = await req.json()
  if (!memberId || !field || typeof value !== 'boolean') {
    return NextResponse.json({ error: 'memberId, field, and value required' }, { status: 400 })
  }

  if (!ALLOWED_FIELDS.includes(field)) {
    return NextResponse.json({ error: 'Invalid field' }, { status: 400 })
  }

  // Ensure the target member belongs to the same org
  const { data: target } = await admin
    .from('org_members').select('org_id, role').eq('id', memberId).single()

  if (!target || target.org_id !== caller.org_id) {
    return NextResponse.json({ error: 'Member not found in your org' }, { status: 404 })
  }

  if (target.role === 'owner') {
    return NextResponse.json({ error: 'Cannot change owner permissions' }, { status: 400 })
  }

  const { error } = await admin.from('org_members').update({ [field]: value }).eq('id', memberId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
