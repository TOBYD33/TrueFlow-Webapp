// (protected)/layout.tsx
// Fetches org data server-side, passes to AppShell client component.
// Mounts TelloBubble and ImpersonationBanner on every protected page.
// During an active impersonation session, uses the target user's org context.

import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase-server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { AppShell } from '@/components/AppShell'
import { TelloBubble } from '@/components/TelloBubble'
import { ImpersonationBanner } from '@/components/ImpersonationBanner'
import { ViewingContextProvider } from '@/components/ViewingContext'

function getAdmin() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const admin = getAdmin()

  // Check for active impersonation session
  const cookieStore = await cookies()
  const impersonationSessionId = cookieStore.get('impersonation_session_id')?.value
  let impersonationUserName: string | null = null
  let impersonationOrgId: string | null = null
  let impersonationUserId: string | null = null
  let impersonationPhone: string | null = null

  if (impersonationSessionId) {
    const { data: imp } = await admin
      .from('impersonation_sessions')
      .select('target_org_id, target_user_id, target:profiles!target_user_id(full_name, phone)')
      .eq('id', impersonationSessionId)
      .eq('is_active', true)
      .single()

    if (imp) {
      const target = (imp as any).target
      impersonationUserName = target?.full_name ?? 'Unknown user'
      impersonationOrgId = (imp as any).target_org_id ?? null
      impersonationUserId = (imp as any).target_user_id ?? null
      impersonationPhone = target?.phone ?? null

      // If session has no target_org_id, look it up from the target user's org_members row
      if (!impersonationOrgId && impersonationUserId) {
        const { data: targetMember } = await admin
          .from('org_members')
          .select('org_id')
          .eq('user_id', impersonationUserId)
          .is('removed_at', null)
          .maybeSingle()
        impersonationOrgId = targetMember?.org_id ?? null
      }
    }
  }

  // Use impersonation org if active — NEVER fall back to admin's own org during impersonation
  let orgId: string | null = impersonationOrgId
  let viewingUserId: string | null = impersonationUserId
  let viewingPhone: string | null = impersonationPhone
  let orgName = 'TrueFlio'
  let plan = 'free'

  if (!impersonationSessionId) {
    // Use admin client so this works regardless of org_members RLS policy state
    const { data: member } = await admin
      .from('org_members')
      .select('org_id')
      .eq('user_id', user.id)
      .maybeSingle()
    orgId = member?.org_id ?? null
    viewingUserId = user.id
    const { data: ownProfile } = await admin
      .from('profiles')
      .select('phone')
      .eq('id', user.id)
      .maybeSingle()
    viewingPhone = ownProfile?.phone ?? null
  }

  if (orgId) {
    const { data: org } = await admin
      .from('organizations')
      .select('name, plan')
      .eq('id', orgId)
      .single()
    if (org) {
      orgName = org.name ?? orgName
      plan = org.plan ?? plan
    }
  }

  // First-time status: zero receipts in the org
  let isFirstTime = true
  if (orgId) {
    const { count } = await admin
      .from('receipts')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', orgId)
    isFirstTime = (count ?? 0) === 0
  }

  return (
    <ViewingContextProvider
      orgId={orgId}
      userId={viewingUserId}
      phone={viewingPhone}
      isImpersonating={!!impersonationSessionId}
    >
      {impersonationSessionId && impersonationUserName && (
        <ImpersonationBanner
          userName={impersonationUserName}
          sessionId={impersonationSessionId}
        />
      )}
      <div style={impersonationSessionId ? { paddingTop: '44px' } : undefined}>
        <AppShell orgName={orgName} plan={plan}>
          {children}
        </AppShell>
        {orgId && !impersonationSessionId && (
          <TelloBubble
            userId={user.id}
            orgId={orgId}
            isFirstTime={isFirstTime}
          />
        )}
      </div>
    </ViewingContextProvider>
  )
}
