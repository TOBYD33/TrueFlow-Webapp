// (protected)/layout.tsx
// Fetches org data server-side, passes to AppShell client component
// which manages the mobile sidebar drawer and sticky header.

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase-server'
import { AppShell } from '@/components/AppShell'

export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: member } = await supabase
    .from('org_members')
    .select('org_id, role')
    .eq('user_id', user.id)
    .single()

  let orgName = 'TrueFlow'
  let plan = 'free'

  if (member?.org_id) {
    const { data: org } = await supabase
      .from('organizations')
      .select('name, plan')
      .eq('id', member.org_id)
      .single()
    if (org) {
      orgName = org.name ?? orgName
      plan = org.plan ?? plan
    }
  }

  return (
    <AppShell orgName={orgName} plan={plan}>
      {children}
    </AppShell>
  )
}
