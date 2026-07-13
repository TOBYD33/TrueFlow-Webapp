// api/admin/update-user/route.ts
// Super/Support Admin: directly edit a user's full_name, phone, email,
// organization name, and plan. Every changed field writes old and new
// values to admin_audit_log (same pattern as the original plan-change).

import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, getAdminClient } from '@/lib/admin-auth'
import { logAdminAction } from '@/lib/admin-audit'

const PLAN_RECEIPT_LIMITS: Record<string, number> = {
  free: 10, individual: -1, family: -1, freelancer: -1,
  sme_starter: -1, agency: -1, sme_pro: -1, studio: -1, enterprise: -1,
}
const PLAN_CLIENT_LIMITS: Record<string, number> = {
  free: 0, individual: 0, family: 0, freelancer: 10,
  sme_starter: 10, agency: 50, sme_pro: 50, studio: -1, enterprise: -1,
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(['super', 'support'])
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { userId, orgId, fields } = await req.json() as {
    userId: string
    orgId: string | null
    fields: { full_name?: string; phone?: string; email?: string; org_name?: string; plan?: string }
  }
  if (!userId || !fields) return NextResponse.json({ error: 'Missing fields' }, { status: 400 })

  const admin = getAdminClient()
  const changes: Record<string, { old: unknown; new: unknown }> = {}

  // Current values for the audit trail
  const { data: profile } = await admin.from('profiles').select('full_name, phone').eq('id', userId).maybeSingle()
  const { data: org } = orgId
    ? await admin.from('organizations').select('name, plan').eq('id', orgId).maybeSingle()
    : { data: null }

  // profiles.full_name / phone
  const profileUpdate: Record<string, string> = {}
  if (fields.full_name !== undefined && fields.full_name !== profile?.full_name) {
    profileUpdate.full_name = fields.full_name
    changes.full_name = { old: profile?.full_name ?? null, new: fields.full_name }
  }
  if (fields.phone !== undefined && fields.phone !== profile?.phone) {
    profileUpdate.phone = fields.phone
    changes.phone = { old: profile?.phone ?? null, new: fields.phone }
  }
  if (Object.keys(profileUpdate).length > 0) {
    const { error } = await admin.from('profiles').update(profileUpdate).eq('id', userId)
    if (error) return NextResponse.json({ error: `Profile update failed: ${error.message}` }, { status: 500 })
  }

  // Email lives in Supabase Auth
  if (fields.email) {
    const { data: authUser } = await admin.auth.admin.getUserById(userId)
    const oldEmail = authUser?.user?.email ?? null
    if (oldEmail !== fields.email) {
      const { error } = await admin.auth.admin.updateUserById(userId, { email: fields.email, email_confirm: true })
      if (error) return NextResponse.json({ error: `Email update failed: ${error.message}` }, { status: 500 })
      changes.email = { old: oldEmail, new: fields.email }
    }
  }

  // organizations.name / plan
  if (orgId) {
    const orgUpdate: Record<string, unknown> = {}
    if (fields.org_name !== undefined && fields.org_name !== org?.name) {
      orgUpdate.name = fields.org_name
      changes.org_name = { old: org?.name ?? null, new: fields.org_name }
    }
    if (fields.plan !== undefined && fields.plan !== org?.plan && PLAN_RECEIPT_LIMITS[fields.plan] !== undefined) {
      orgUpdate.plan = fields.plan
      orgUpdate.receipt_limit = PLAN_RECEIPT_LIMITS[fields.plan]
      orgUpdate.client_limit = PLAN_CLIENT_LIMITS[fields.plan]
      changes.plan = { old: org?.plan ?? null, new: fields.plan }
    }
    if (Object.keys(orgUpdate).length > 0) {
      const { error } = await admin.from('organizations').update(orgUpdate).eq('id', orgId)
      if (error) return NextResponse.json({ error: `Organisation update failed: ${error.message}` }, { status: 500 })
    }
  }

  if (Object.keys(changes).length === 0) {
    return NextResponse.json({ success: true, changed: [] })
  }

  await logAdminAction({
    adminId: auth.userId,
    action: 'edit_user_fields',
    targetTable: 'profiles',
    targetId: userId,
    details: changes,
  })

  return NextResponse.json({ success: true, changed: Object.keys(changes) })
}
