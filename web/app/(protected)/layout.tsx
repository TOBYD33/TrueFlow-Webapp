// (protected)/layout.tsx
// Fetches org data server-side, passes to AppShell client component
// which manages the mobile sidebar drawer and sticky header.
// Also mounts TelloBubble (Tello AI persona) on every protected page.

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase-server'
import { AppShell } from '@/components/AppShell'
import { TelloBubble } from '@/components/TelloBubble'

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

  // Determine first-time status: zero receipts in the org = first-time user
  let isFirstTime = true
  if (member?.org_id) {
    const { count } = await supabase
      .from('receipts')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', member.org_id)
    isFirstTime = (count ?? 0) === 0
  }

  return (
    <>
      <AppShell orgName={orgName} plan={plan}>
        {children}
      </AppShell>
      {member?.org_id && (
        <TelloBubble
          userId={user.id}
          orgId={member.org_id}
          isFirstTime={isFirstTime}
        />
      )}
    </>
  )
}
