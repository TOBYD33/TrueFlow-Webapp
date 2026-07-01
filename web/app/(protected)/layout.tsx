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

  if (impersonationSessionId) {
    const { data: imp } = await admin
      .from('impersonation_sessions')
      .select('target_org_id, target:profiles!target_user_id(full_name)')
      .eq('id', impersonationSessionId)
      .eq('is_active', true)
      .single()

    if (imp) {
      impersonationUserName = (imp as any).target?.full_name ?? 'Unknown user'
      impersonationOrgId = (imp as any).target_org_id ?? null
    }
  }

  // Use impersonation org if active, otherwise logged-in user's org
  let orgId: string | null = impersonationOrgId
  let orgName = 'TrueFlio'
  let plan = 'free'

  if (!orgId) {
    const { data: member } = await supabase
      .from('org_members')
      .select('org_id, role')
      .eq('user_id', user.id)
      .single()
    orgId = member?.org_id ?? null
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
    const { count } = await supabase
      .from('receipts')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', orgId)
    isFirstTime = (count ?? 0) === 0
  }

  return (
    <>
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
    </>
  )
}
