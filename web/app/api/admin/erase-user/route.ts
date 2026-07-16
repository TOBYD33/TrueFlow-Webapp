// api/admin/erase-user/route.ts
// Permanently Erase a USER's entire identity — distinct from Erase
// Organization. Finds every org this profile OWNS, erases each one
// (same logic as Erase Organization, via the shared erase_organization
// SQL function), then wipes the profile, Supabase Auth login, and
// WhatsApp session/conversation history. Super Admin only.
//
// GET  ?profileId=  or  ?phone=   → preview: resolves the profile and
//      lists every organization that would be destroyed, before the
//      admin sees the typed "Delete" confirmation.
// POST { profileId, confirmation } → executes the erasure.
//
// ⚠️ TESTING-PHASE BEHAVIOUR — INTENTIONALLY IMMEDIATE (see CLAUDE.md's
// "cooling-off" reminder note): same as Erase Organization, no delay yet.
// The audit log entry is written BEFORE the deletion so it survives it.

import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, getAdminClient } from '@/lib/admin-auth'
import { logAdminAction } from '@/lib/admin-audit'
import { normalisePhone } from '@/lib/whatsapp'

async function resolveProfile(admin: ReturnType<typeof getAdminClient>, profileId?: string, phone?: string) {
  let id = profileId ?? null

  if (!id && phone) {
    const { data } = await admin
      .from('profiles')
      .select('id')
      .eq('phone', normalisePhone(phone))
      .maybeSingle()
    id = data?.id ?? null
  }
  if (!id) return null

  const { data: profile } = await admin
    .from('profiles')
    .select('id, full_name, phone, merged_into_id')
    .eq('id', id)
    .maybeSingle()
  if (!profile) return null

  // Always resolve to the primary identity — never erase a merged-away
  // secondary while the real, active account sits untouched elsewhere.
  if (profile.merged_into_id) {
    const { data: primary } = await admin
      .from('profiles')
      .select('id, full_name, phone, merged_into_id')
      .eq('id', profile.merged_into_id)
      .maybeSingle()
    if (primary) return primary
  }
  return profile
}

async function ownedOrgs(admin: ReturnType<typeof getAdminClient>, profileId: string) {
  const { data } = await admin
    .from('org_members')
    .select('org_id, organizations(id, name, plan)')
    .eq('user_id', profileId)
    .eq('role', 'owner')
  return (data ?? []).map((m: any) => m.organizations).filter(Boolean)
}

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(['super'])
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { searchParams } = new URL(req.url)
  const profileId = searchParams.get('profileId') ?? undefined
  const phone = searchParams.get('phone') ?? undefined
  if (!profileId && !phone) return NextResponse.json({ error: 'Missing profileId or phone' }, { status: 400 })

  const admin = getAdminClient()
  const profile = await resolveProfile(admin, profileId, phone)
  if (!profile) return NextResponse.json({ error: 'No user found for that identifier' }, { status: 404 })

  const orgs = await ownedOrgs(admin, profile.id)

  return NextResponse.json({
    profileId: profile.id,
    fullName: profile.full_name,
    phone: profile.phone,
    orgs: orgs.map((o: any) => ({ id: o.id, name: o.name, plan: o.plan })),
  })
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(['super'])
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { profileId, confirmation } = await req.json() as { profileId: string; confirmation: string }
  if (!profileId) return NextResponse.json({ error: 'Missing profileId' }, { status: 400 })

  if (confirmation !== 'Delete') {
    return NextResponse.json({ error: 'Confirmation text does not match. Type exactly: Delete' }, { status: 400 })
  }

  const admin = getAdminClient()
  const profile = await resolveProfile(admin, profileId, undefined)
  if (!profile) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  const orgs = await ownedOrgs(admin, profile.id)

  // Log FIRST — this record must survive the erasure
  await logAdminAction({
    adminId: auth.userId,
    action: 'permanently_erase_user',
    targetTable: 'profiles',
    targetId: profile.id,
    details: {
      full_name: profile.full_name,
      phone: profile.phone,
      owned_orgs: orgs.map((o: any) => ({ id: o.id, name: o.name })),
      typed_confirmation: confirmation,
      requested_at: new Date().toISOString(),
      note: 'testing-phase immediate erasure (no cooling-off, see CLAUDE.md)',
    },
  })

  const { error } = await admin.rpc('erase_user', { p_profile_id: profile.id })
  if (error) {
    console.error('admin/erase-user failed:', error)
    return NextResponse.json({ error: `Erasure failed: ${error.message}` }, { status: 500 })
  }

  return NextResponse.json({ success: true, orgsErased: orgs.map((o: any) => o.name) })
}
