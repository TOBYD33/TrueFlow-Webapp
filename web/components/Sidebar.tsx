'use client'
// Sidebar.tsx
// Navigation sidebar — static on desktop, slide-in drawer on mobile.

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import {
  LayoutDashboard,
  Receipt,
  BarChart3,
  FileText,
  Users,
  Settings,
  UserCircle2,
  FolderKanban,
  TrendingUp,
  Bell,
  PiggyBank,
  MessageSquare,
  Package,
  Landmark,
  X,
} from 'lucide-react'

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/whatsapp', label: 'True Assistant', icon: MessageSquare },
  { href: '/receipts', label: 'Receipts', icon: Receipt },
  { href: '/inventory', label: 'Inventory', icon: Package },
  { href: '/budgets', label: 'Budgets', icon: PiggyBank },
  { href: '/reminders', label: 'Reminders', icon: Bell },
  { href: '/clients', label: 'Clients', icon: UserCircle2 },
  { href: '/projects', label: 'Projects', icon: FolderKanban },
  { href: '/income', label: 'Income', icon: TrendingUp },
  { href: '/reports', label: 'Reports', icon: BarChart3 },
  { href: '/tax', label: 'Tax Hub', icon: Landmark },
  { href: '/invoices', label: 'Invoices', icon: FileText },
  { href: '/team', label: 'Team', icon: Users },
  { href: '/settings', label: 'Settings', icon: Settings },
]

interface SidebarProps {
  isOpen?: boolean
  onClose?: () => void
  orgName?: string
}

export function Sidebar({ isOpen = false, onClose, orgName }: SidebarProps) {
  const pathname = usePathname()

  function handleNavClick() {
    onClose?.()
  }

  return (
    <aside
      className={cn(
        'w-60 bg-gray-900 text-white flex flex-col z-40 shrink-0',
        // Desktop: always visible as part of layout flow
        'hidden md:flex',
        // Mobile: fixed overlay, toggled by isOpen
        isOpen && 'flex fixed inset-y-0 left-0'
      )}
    >
      {/* Header */}
      <div className="px-6 py-5 border-b border-gray-800 flex items-center justify-between">
        <div>
          <span className="text-xl font-bold text-emerald-400">TrueFlow</span>
          {orgName && orgName !== 'TrueFlow' && orgName !== 'My Business'
            ? <p className="text-xs text-gray-300 mt-0.5 font-medium truncate max-w-[160px]">{orgName}</p>
            : <p className="text-xs text-gray-500 mt-0.5">Financial Dashboard</p>
          }
        </div>
        {/* Close button — mobile only */}
        {isOpen && (
          <button
            onClick={onClose}
            className="md:hidden p-1.5 rounded-lg hover:bg-gray-800 transition-colors text-gray-400 hover:text-white"
            aria-label="Close menu"
          >
            <X size={18} />
          </button>
        )}
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {navItems.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            onClick={handleNavClick}
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

    </aside>
  )
}
