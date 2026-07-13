// api/admin/erase/route.ts
// Permanently Erase an organization and its sole members. Super Admin only.
//
// ⚠️ TESTING-PHASE BEHAVIOUR — INTENTIONALLY IMMEDIATE (see CLAUDE.md's
// "cooling-off" reminder note): erasure runs the hard delete straight away
// after the typed "Delete" confirmation. The pending_erasures table exists
// so the 24-hour cancellable cooling-off flow can be switched on before
// MVP launch, but it is deliberately NOT wired into this flow yet, so
// Ambassador test accounts can be deleted and recreated without waiting.
//
// The audit log entry is written BEFORE the deletion so it survives it.

import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, getAdminClient } from '@/lib/admin-auth'
import { logAdminAction } from '@/lib/admin-audit'

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(['super'])
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { orgId, confirmation } = await req.json() as { orgId: string; confirmation: string }
  if (!orgId) return NextResponse.json({ error: 'Missing orgId' }, { status: 400 })

  // Server-side enforcement of the typed, case-sensitive confirmation
  if (confirmation !== 'Delete') {
    return NextResponse.json({ error: 'Confirmation text does not match. Type exactly: Delete' }, { status: 400 })
  }

  const admin = getAdminClient()
  const { data: org } = await admin
    .from('organizations')
    .select('id, name, plan')
    .eq('id', orgId)
    .maybeSingle()
  if (!org) return NextResponse.json({ error: 'Organisation not found' }, { status: 404 })

  // Log FIRST — this record must survive the erasure
  await logAdminAction({
    adminId: auth.userId,
    action: 'permanently_erase_org',
    targetTable: 'organizations',
    targetId: orgId,
    details: {
      org_name: org.name,
      plan: org.plan,
      typed_confirmation: confirmation,
      requested_at: new Date().toISOString(),
      note: 'testing-phase immediate erasure (no cooling-off, see CLAUDE.md)',
    },
  })

  // Single-transaction hard delete via the erase_organization SQL function
  const { error } = await admin.rpc('erase_organization', { p_org_id: orgId })
  if (error) {
    console.error('admin/erase failed:', error)
    return NextResponse.json({ error: `Erasure failed: ${error.message}` }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
