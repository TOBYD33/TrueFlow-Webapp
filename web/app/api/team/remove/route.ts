// api/team/remove/route.ts
// Soft-deletes an org_members row (sets removed_at). Never hard deletes.

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
    .from('org_members').select('org_id, role').eq('user_id', user.id).is('removed_at', null).single()

  if (!caller || !['owner', 'admin'].includes(caller.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { memberId } = await req.json()
  if (!memberId) return NextResponse.json({ error: 'memberId required' }, { status: 400 })

  const { data: target } = await admin
    .from('org_members').select('org_id, role, user_id').eq('id', memberId).single()

  if (!target || target.org_id !== caller.org_id) {
    return NextResponse.json({ error: 'Member not found in your org' }, { status: 404 })
  }

  if (target.role === 'owner') {
    return NextResponse.json({ error: 'Cannot remove the org owner' }, { status: 400 })
  }

  // Admin cannot remove another admin — only owner can
  if (target.role === 'admin' && caller.role !== 'owner') {
    return NextResponse.json({ error: 'Only the owner can remove admin members' }, { status: 403 })
  }

  const { error } = await admin
    .from('org_members')
    .update({ removed_at: new Date().toISOString() })
    .eq('id', memberId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
