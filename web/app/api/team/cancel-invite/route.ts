// api/team/cancel-invite/route.ts
// Cancels a pending invite by clearing invite_token and soft-deleting the placeholder row.

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

  const { inviteId } = await req.json()
  if (!inviteId) return NextResponse.json({ error: 'inviteId required' }, { status: 400 })

  // Validate it's in the same org and still pending
  const { data: invite } = await admin
    .from('org_members')
    .select('org_id, invite_token')
    .eq('id', inviteId)
    .not('invite_token', 'is', null)
    .single()

  if (!invite || invite.org_id !== caller.org_id) {
    return NextResponse.json({ error: 'Invite not found' }, { status: 404 })
  }

  const { error } = await admin
    .from('org_members')
    .update({ invite_token: null, invite_expires_at: null, removed_at: new Date().toISOString() })
    .eq('id', inviteId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
