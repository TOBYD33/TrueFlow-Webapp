'use client'
// whatsapp/page.tsx
// WhatsApp conversation viewer — sessions list on left, chat thread on right

import { useEffect, useState, useRef } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { MessageSquare } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Session {
  phone_number: string
  last_active_at: string
  is_new: boolean
}

interface Message {
  id: string
  phone_number: string
  role: 'user' | 'assistant'
  content: string
  created_at: string
}

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

export default function WhatsAppPage() {
  const supabase = createClient()
  const [orgId, setOrgId] = useState<string | null>(null)
  const [sessions, setSessions] = useState<Session[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(true)
  const [msgLoading, setMsgLoading] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    async function load() {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return
        const { data: member } = await supabase.from('org_members').select('org_id, whatsapp_number').eq('user_id', user.id).single()
        if (!member) return
        setOrgId(member.org_id)

        // Fetch sessions linked to this org
        const { data: orgSessions } = await supabase
          .from('whatsapp_sessions')
          .select('phone_number, last_active_at, is_new')
          .eq('org_id', member.org_id)
          .order('last_active_at', { ascending: false })

        // Also fetch all org member phone numbers and get their sessions (bot may not set org_id)
        const { data: allMembers } = await supabase
          .from('org_members')
          .select('whatsapp_number')
          .eq('org_id', member.org_id)
          .not('whatsapp_number', 'is', null)

        const memberPhones = (allMembers ?? []).map(m => m.whatsapp_number).filter(Boolean)

        let extraSessions: Session[] = []
        if (memberPhones.length > 0) {
          const { data: phoneSessions } = await supabase
            .from('whatsapp_sessions')
            .select('phone_number, last_active_at, is_new')
            .in('phone_number', memberPhones)
            .order('last_active_at', { ascending: false })
          extraSessions = (phoneSessions as Session[]) ?? []
        }

        // Merge, deduplicate by phone_number, sort by last_active_at
        const merged = [...(orgSessions as Session[] ?? []), ...extraSessions]
        const seen = new Set<string>()
        const unique = merged.filter(s => {
          if (seen.has(s.phone_number)) return false
          seen.add(s.phone_number)
          return true
        }).sort((a, b) => new Date(b.last_active_at).getTime() - new Date(a.last_active_at).getTime())

        setSessions(unique)
        if (unique.length > 0) setSelected(unique[0].phone_number)
      } catch (err) {
        console.error('WhatsAppPage load failed:', err)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  useEffect(() => {
    if (!selected) return
    async function loadMessages() {
      setMsgLoading(true)
      try {
        const { data, error } = await supabase
          .from('whatsapp_conversations')
          .select('*')
          .eq('phone_number', selected)
          .order('created_at', { ascending: true })
          .limit(100)
        if (error) console.error('loadMessages failed:', error)
        setMessages((data as Message[]) ?? [])
      } finally {
        setMsgLoading(false)
      }
    }
    loadMessages()
  }, [selected])

  // Realtime: new messages appear live
  useEffect(() => {
    if (!selected) return
    const channel = supabase
      .channel(`chat:${selected}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'whatsapp_conversations',
        filter: `phone_number=eq.${selected}`,
      }, payload => {
        setMessages(prev => [...prev, payload.new as Message])
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [selected])

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  return (
    <div className="flex h-[calc(100vh-4rem)] -m-6 overflow-hidden">
      {/* Sessions list */}
      <div className="w-72 flex-shrink-0 border-r border-gray-200 bg-white flex flex-col">
        <div className="px-4 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900 flex items-center gap-2">
            <MessageSquare size={16} className="text-[#25D366]" />
            WhatsApp Chats
          </h2>
          <p className="text-xs text-gray-400 mt-0.5">{sessions.length} conversation{sessions.length !== 1 ? 's' : ''}</p>
        </div>
        <div className="flex-1 overflow-y-auto divide-y divide-gray-100">
          {loading ? (
            <div className="p-6 text-center text-sm text-gray-400">Loading…</div>
          ) : sessions.length === 0 ? (
            <div className="p-6 text-center text-sm text-gray-400">
              No WhatsApp conversations yet
            </div>
          ) : sessions.map(s => (
            <button
              key={s.phone_number}
              onClick={() => setSelected(s.phone_number)}
              className={cn(
                'w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors',
                selected === s.phone_number && 'bg-emerald-50 border-r-2 border-emerald-500'
              )}
            >
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-[#25D366] flex items-center justify-center flex-shrink-0">
                  <MessageSquare size={15} className="text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{s.phone_number}</p>
                  <p className="text-xs text-gray-400">{timeAgo(s.last_active_at)}</p>
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Chat thread */}
      <div className="flex-1 flex flex-col bg-gray-50">
        {!selected ? (
          <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
            Select a conversation
          </div>
        ) : (
          <>
            {/* Chat header */}
            <div className="px-5 py-3 bg-white border-b border-gray-200 flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-[#25D366] flex items-center justify-center">
                <MessageSquare size={14} className="text-white" />
              </div>
              <div>
                <p className="font-medium text-gray-900 text-sm">{selected}</p>
                <p className="text-xs text-gray-400">WhatsApp · TrueFlow Bot</p>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
              {msgLoading ? (
                <div className="text-center text-sm text-gray-400 py-8">Loading…</div>
              ) : messages.length === 0 ? (
                <div className="text-center text-sm text-gray-400 py-8">No messages yet</div>
              ) : messages.map(msg => (
                <div
                  key={msg.id}
                  className={cn('flex', msg.role === 'user' ? 'justify-end' : 'justify-start')}
                >
                  <div
                    className={cn(
                      'max-w-[70%] rounded-2xl px-4 py-2.5 text-sm shadow-sm',
                      msg.role === 'user'
                        ? 'bg-[#25D366] text-white rounded-br-sm'
                        : 'bg-white text-gray-800 rounded-bl-sm border border-gray-100'
                    )}
                  >
                    <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                    <p className={cn(
                      'text-xs mt-1 text-right',
                      msg.role === 'user' ? 'text-green-100' : 'text-gray-400'
                    )}>
                      {new Date(msg.created_at).toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                </div>
              ))}
              <div ref={bottomRef} />
            </div>
          </>
        )}
      </div>
    </div>
  )
}
