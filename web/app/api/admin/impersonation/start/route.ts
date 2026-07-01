// api/admin/impersonation/start/route.ts
// Starts an admin impersonation session.
// Inserts into BOTH impersonation_sessions AND admin_audit_log before setting cookie.
// If either insert fails, the session is not started.

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

  const admin = getAdmin()

  const { data: profile } = await admin
    .from('profiles')
    .select('admin_role, is_super_admin')
    .eq('id', user.id)
    .single()

  const adminRole = profile?.admin_role ?? (profile?.is_super_admin ? 'super' : null)
  if (!adminRole || !['super', 'support'].includes(adminRole)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { targetUserId, targetOrgId, reason } = await req.json()
  if (!targetUserId || !reason?.trim()) {
    return NextResponse.json({ error: 'targetUserId and reason are required' }, { status: 400 })
  }

  // 1. Insert impersonation session
  const { data: session, error: sessionError } = await admin
    .from('impersonation_sessions')
    .insert({
      admin_id: user.id,
      target_user_id: targetUserId,
      target_org_id: targetOrgId ?? null,
      is_write_enabled: false,
      notes: reason.trim(),
    })
    .select()
    .single()

  if (sessionError || !session) {
    console.error('impersonation/start: session insert failed:', sessionError)
    return NextResponse.json({ error: 'Failed to create impersonation session' }, { status: 500 })
  }

  // 2. Insert audit log — if this fails, roll back and abort
  const { error: auditError } = await admin.from('admin_audit_log').insert({
    admin_id: user.id,
    action: 'impersonate_start',
    target_table: 'profiles',
    target_id: targetUserId,
    details: { session_id: session.id, target_org_id: targetOrgId, reason: reason.trim() },
  })

  if (auditError) {
    await admin.from('impersonation_sessions').delete().eq('id', session.id)
    console.error('impersonation/start: audit log failed:', auditError)
    return NextResponse.json({ error: 'Failed to log impersonation — session not started' }, { status: 500 })
  }

  // 3. Set cookie (HTTP-only, 30 minute expiry)
  const cookieStore = await cookies()
  cookieStore.set('impersonation_session_id', session.id, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 30,
  })

  return NextResponse.json({ ok: true })
}
