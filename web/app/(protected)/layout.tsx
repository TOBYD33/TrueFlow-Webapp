// (protected)/layout.tsx
// Sidebar + top nav shell for all protected pages

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase-server'
import { Sidebar } from '@/components/Sidebar'

export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  // Get org name for header
  const { data: member } = await supabase
    .from('org_members')
    .select('organizations(name, plan)')
    .eq('user_id', user.id)
    .single()

  const org = (member?.organizations as unknown as { name: string; plan: string } | null)
  const orgName = org?.name ?? 'My Business'
  const plan = org?.plan ?? 'free'

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
