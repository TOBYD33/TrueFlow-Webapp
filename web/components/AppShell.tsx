'use client'
// AppShell.tsx
// Client wrapper that manages mobile sidebar open/close state, the sticky
// top header with user avatar dropdown, and passes orgName to the sidebar.

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Sidebar } from './Sidebar'
import { createClient } from '@/lib/supabase-browser'
import { Menu, Settings, User, LogOut } from 'lucide-react'

interface AppShellProps {
  children: React.ReactNode
  orgName: string
  plan: string
}

export function AppShell({ children, orgName, plan }: AppShellProps) {
  const supabase = createClient()
  const router = useRouter()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [initials, setInitials] = useState('?')
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Fetch current user's avatar + initials once
  useEffect(() => {
    async function loadAvatar() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data } = await supabase.from('profiles').select('full_name, avatar_url').eq('id', user.id).single()
      if (data?.avatar_url) setAvatarUrl(data.avatar_url)
      if (data?.full_name) {
        const parts = data.full_name.trim().split(/\s+/)
        setInitials(parts.map((p: string) => p[0]).slice(0, 2).join('').toUpperCase())
      } else if (user.email) {
        setInitials(user.email[0].toUpperCase())
      }
    }
    loadAvatar()
  }, [])

  // Live-refresh avatar when profile page saves a new one
  useEffect(() => {
    function onAvatarUpdated(e: Event) {
      const url = (e as CustomEvent<{ url: string }>).detail?.url
      if (url) setAvatarUrl(url)
    }
    window.addEventListener('trueflio:avatar-updated', onAvatarUpdated)
    return () => window.removeEventListener('trueflio:avatar-updated', onAvatarUpdated)
  }, [])

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false)
      }
    }
    if (dropdownOpen) document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [dropdownOpen])

  async function handleSignOut() {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <div className="flex min-h-screen bg-gray-50">
      {/* Mobile backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-30 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} orgName={orgName} />

      <div className="flex-1 flex flex-col min-w-0">
        <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-3 sticky top-0 z-20">
          {/* Hamburger — mobile only */}
          <button
            className="md:hidden p-2 rounded-lg hover:bg-gray-100 transition-colors -ml-1 shrink-0"
            onClick={() => setSidebarOpen(true)}
            aria-label="Open menu"
          >
            <Menu size={20} className="text-gray-600" />
          </button>

          <h2 className="text-sm font-medium text-gray-600 truncate flex-1">{orgName}</h2>

          <span className="text-xs font-semibold uppercase tracking-wide px-2 py-1 rounded-full bg-emerald-100 text-emerald-700 shrink-0">
            {plan}
          </span>

          {/* User avatar + dropdown */}
          <div className="relative shrink-0" ref={dropdownRef}>
            <button
              onClick={() => setDropdownOpen(v => !v)}
              className="w-8 h-8 rounded-full overflow-hidden border-2 border-gray-200 hover:border-emerald-400 transition-colors flex items-center justify-center bg-emerald-100 text-emerald-700 text-xs font-bold"
              aria-label="User menu"
            >
              {avatarUrl
                ? <img src={avatarUrl} alt="avatar" className="w-full h-full object-cover" />
                : initials
              }
            </button>

            {dropdownOpen && (
              <div className="absolute right-0 top-full mt-2 w-44 bg-white rounded-xl shadow-lg border border-gray-100 py-1 z-50">
                <Link
                  href="/settings/profile"
                  onClick={() => setDropdownOpen(false)}
                  className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  <User size={15} className="text-gray-400" /> Profile
                </Link>
                <Link
                  href="/settings/business"
                  onClick={() => setDropdownOpen(false)}
                  className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  <Settings size={15} className="text-gray-400" /> Settings
                </Link>
                <div className="border-t border-gray-100 my-1" />
                <button
                  onClick={handleSignOut}
                  className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors"
                >
                  <LogOut size={15} /> Sign out
                </button>
              </div>
            )}
          </div>
        </header>

        <main className="flex-1 p-4 md:p-6 min-w-0">
          {children}
        </main>
      </div>
    </div>
  )
}
