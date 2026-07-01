// api/admin/impersonation/end/route.ts
// Ends an active impersonation session, logs to audit, clears cookie.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

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

  const { sessionId } = await req.json()
  if (!sessionId) return NextResponse.json({ error: 'sessionId required' }, { status: 400 })

  const admin = getAdmin()

  const { data: session, error: updateError } = await admin
    .from('impersonation_sessions')
    .update({ ended_at: new Date().toISOString(), is_active: false })
    .eq('id', sessionId)
    .eq('admin_id', user.id)
    .select('target_user_id')
    .single()

  if (updateError) {
    console.error('impersonation/end: update failed:', updateError)
    return NextResponse.json({ error: 'Failed to end session' }, { status: 500 })
  }

  await admin.from('admin_audit_log').insert({
    admin_id: user.id,
    action: 'impersonate_end',
    target_table: 'profiles',
    target_id: session?.target_user_id,
    details: { session_id: sessionId },
  })

  const cookieStore = await cookies()
  cookieStore.delete('impersonation_session_id')

  return NextResponse.json({ ok: true })
}
