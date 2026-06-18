'use client'
// Sidebar.tsx
// Main navigation sidebar with active state and logout

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'
import { cn } from '@/lib/utils'
import {
  LayoutDashboard,
  Receipt,
  BarChart3,
  FileText,
  Users,
  Settings,
  LogOut,
  UserCircle2,
  FolderKanban,
  TrendingUp,
  Bell,
  PiggyBank,
  MessageSquare,
} from 'lucide-react'

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/whatsapp', label: 'WhatsApp', icon: MessageSquare },
  { href: '/receipts', label: 'Receipts', icon: Receipt },
  { href: '/budgets', label: 'Budgets', icon: PiggyBank },
  { href: '/reminders', label: 'Reminders', icon: Bell },
  { href: '/clients', label: 'Clients', icon: UserCircle2 },
  { href: '/projects', label: 'Projects', icon: FolderKanban },
  { href: '/income', label: 'Income', icon: TrendingUp },
  { href: '/reports', label: 'Reports', icon: BarChart3 },
  { href: '/invoices', label: 'Invoices', icon: FileText },
  { href: '/team', label: 'Team', icon: Users },
  { href: '/settings', label: 'Settings', icon: Settings },
]

export function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <aside className="w-60 min-h-screen bg-gray-900 text-white flex flex-col">
      <div className="px-6 py-5 border-b border-gray-800">
        <span className="text-xl font-bold text-emerald-400">TrueFlow</span>
        <p className="text-xs text-gray-500 mt-0.5">Financial Dashboard</p>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1">
        {navItems.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={cn(
              'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
              pathname.startsWith(href)
                ? 'bg-emerald-600 text-white'
                : 'text-gray-400 hover:bg-gray-800 hover:text-white'
            )}
          >
            <Icon size={18} />
            {label}
          </Link>
        ))}
      </nav>

      <div className="px-3 py-4 border-t border-gray-800">
        <button
          onClick={handleLogout}
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-gray-400 hover:bg-gray-800 hover:text-white transition-colors w-full"
        >
          <LogOut size={18} />
          Sign out
        </button>
      </div>
    </aside>
  )
}
