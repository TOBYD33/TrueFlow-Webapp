// app/(concept)/dashboard-concept/layout.tsx
// Isolated layout for the dashboard redesign proof of concept.
// Performs its own auth check and org lookup — intentionally does NOT use
// the (protected) layout, AppShell, or the live Sidebar, so nothing here
// can affect the live /dashboard. Delete this folder and the concept is gone.

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase-server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { ConceptProvider } from '@/components/dashboard-concept/ConceptProvider'

function getAdmin() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export default async function ConceptLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = getAdmin()
  const { data: member } = await admin
    .from('org_members')
    .select('org_id')
    .eq('user_id', user.id)
    .maybeSingle()

  const orgId = member?.org_id ?? null
  let orgName = 'TrueFlow'
  let plan = 'free'

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

  return (
    <ConceptProvider orgId={orgId} orgName={orgName} plan={plan}>
      {children}
    </ConceptProvider>
  )
}
