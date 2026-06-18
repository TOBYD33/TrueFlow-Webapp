// (protected)/layout.tsx
// Sidebar + top nav shell for all protected pages

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase-server'
import { Sidebar } from '@/components/Sidebar'

export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  // Get org_id first, then fetch org details separately to avoid RLS join issues
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
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <header className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between">
          <h2 className="text-sm font-medium text-gray-600 truncate">{orgName}</h2>
          <span className="text-xs font-semibold uppercase tracking-wide px-2 py-1 rounded-full bg-emerald-100 text-emerald-700">
            {plan}
          </span>
        </header>
        <main className="flex-1 p-6">
          {children}
        </main>
      </div>
    </div>
  )
}
