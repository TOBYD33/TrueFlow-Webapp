'use client'
// whatsapp/page.tsx
// WhatsApp panel — account linking, conversation history, and web chat.
// Users can link their WhatsApp number, then chat with the TrueFlow bot
// directly from the web app. Messages sync with WhatsApp in real time.

import { useEffect, useState, useRef } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { MessageSquare, Send, Link, CheckCircle } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

interface Session {
  phone_number: string
  last_active_at: string
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

// ── Phone Linking Flow ────────────────────────────────────────────────────────

function LinkPhoneCard({ onLinked }: { onLinked: (phone: string) => void }) {
  const [step, setStep] = useState<'prompt' | 'phone' | 'otp' | 'done'>('prompt')
  const [phone, setPhone] = useState('')
  const [normalisedPhone, setNormalisedPhone] = useState('')
  const [otp, setOtp] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function sendCode(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true); setError(null)
    const res = await fetch('/api/auth/whatsapp/send-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone }),
    })
    const json = await res.json()
    setBusy(false)
    if (!res.ok || json.error) { setError(json.error || 'Failed to send code.'); return }
    setNormalisedPhone(json.phone)
    setStep('otp')
  }

  async function verifyAndLink(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true); setError(null)
    const res = await fetch('/api/whatsapp/link-phone', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: normalisedPhone, code: otp }),
    })
    const json = await res.json()
    setBusy(false)
    if (!res.ok || json.error) { setError(json.error || 'Verification failed.'); return }
    setStep('done')
    setTimeout(() => onLinked(normalisedPhone), 1000)
  }

  if (step === 'prompt') {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="max-w-sm w-full text-center">
          <div className="w-16 h-16 rounded-full bg-[#25D366]/10 flex items-center justify-center mx-auto mb-4">
            <Link size={28} className="text-[#25D366]" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Link your WhatsApp</h3>
          <p className="text-sm text-gray-500 mb-6">
            Connect your WhatsApp number to chat with TrueFlow here in the web app.
            Your conversation history will sync automatically.
          </p>
          <button
            onClick={() => setStep('phone')}
            className="w-full h-10 rounded-lg bg-[#25D366] hover:bg-[#1ebe5d] text-white text-sm font-semibold transition-colors"
          >
            Link WhatsApp number
          </button>
        </div>
      </div>
    )
  }

  if (step === 'phone') {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="max-w-sm w-full">
          <h3 className="text-lg font-semibold text-gray-900 mb-1">Enter your WhatsApp number</h3>
          <p className="text-sm text-gray-500 mb-5">We'll send a 6-digit code to verify it's yours.</p>
          <form onSubmit={sendCode} className="space-y-3">
            <Input
              type="tel"
              placeholder="+2348012345678"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              required
            />
            <p className="text-xs text-gray-400">Include your country code — e.g. +234 for Nigeria</p>
            {error && <p className="text-sm text-red-500">{error}</p>}
            <button
              type="submit"
              disabled={busy}
              className="w-full h-10 rounded-lg bg-[#25D366] hover:bg-[#1ebe5d] text-white text-sm font-semibold transition-colors disabled:opacity-60"
            >
              {busy ? 'Sending…' : 'Send Code via WhatsApp'}
            </button>
          </form>
        </div>
      </div>
    )
  }

  if (step === 'otp') {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="max-w-sm w-full">
          <h3 className="text-lg font-semibold text-gray-900 mb-1">Enter the code</h3>
          <p className="text-sm text-gray-500 mb-5">
            Sent to <span className="font-semibold">{normalisedPhone}</span> on WhatsApp.
          </p>
          <form onSubmit={verifyAndLink} className="space-y-3">
            <Input
              className="text-center text-xl tracking-widest font-mono"
              type="text"
              inputMode="numeric"
              maxLength={6}
              placeholder="000000"
              value={otp}
              onChange={e => setOtp(e.target.value.replace(/\D/g, ''))}
              required
            />
            {error && <p className="text-sm text-red-500">{error}</p>}
            <button
              type="submit"
              disabled={busy || otp.length !== 6}
              className="w-full h-10 rounded-lg bg-[#25D366] hover:bg-[#1ebe5d] text-white text-sm font-semibold transition-colors disabled:opacity-60"
            >
              {busy ? 'Linking…' : 'Verify & Link'}
            </button>
            <button type="button" onClick={() => setStep('phone')} className="w-full text-xs text-gray-400 hover:text-gray-600 text-center">
              Use a different number
            </button>
          </form>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 flex items-center justify-center p-8">
      <div className="text-center">
        <CheckCircle size={48} className="text-[#25D366] mx-auto mb-3" />
        <p className="font-semibold text-gray-900">WhatsApp linked!</p>
        <p className="text-sm text-gray-400 mt-1">Loading your conversations…</p>
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function WhatsAppPage() {
  const supabase = createClient()
  const [linkedPhone, setLinkedPhone] = useState<string | null>(null)
  const [sessions, setSessions] = useState<Session[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(true)
  const [msgLoading, setMsgLoading] = useState(false)
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  async function loadSessions(orgId: string, phone: string | null) {
    const { data: orgSessions } = await supabase
      .from('whatsapp_sessions')
      .select('phone_number, last_active_at')
      .eq('org_id', orgId)
      .order('last_active_at', { ascending: false })

    let list = (orgSessions as Session[]) ?? []

    // Ensure linked phone is always in the list
    if (phone && !list.find(s => s.phone_number === phone)) {
      list = [{ phone_number: phone, last_active_at: new Date().toISOString() }, ...list]
    }

    setSessions(list)

    // Auto-select linked phone first, otherwise first session
    const autoSelect = phone ?? (list[0]?.phone_number ?? null)
    setSelected(autoSelect)
  }

  useEffect(() => {
    async function init() {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return

        const [{ data: member }, { data: profile }] = await Promise.all([
          supabase.from('org_members').select('org_id').eq('user_id', user.id).single(),
          supabase.from('profiles').select('phone').eq('id', user.id).single(),
        ])

        if (!member) return

        const phone = profile?.phone ?? null
        setLinkedPhone(phone)
        await loadSessions(member.org_id, phone)
      } finally {
        setLoading(false)
      }
    }
    init()
  }, [])

  // Load messages when selected conversation changes
  useEffect(() => {
    if (!selected) return
    async function loadMessages() {
      setMsgLoading(true)
      const { data } = await supabase
        .from('whatsapp_conversations')
        .select('*')
        .eq('phone_number', selected)
        .order('created_at', { ascending: true })
        .limit(100)
      setMessages((data as Message[]) ?? [])
      setMsgLoading(false)
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

  // Auto-scroll to bottom
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function sendMessage(e: React.FormEvent) {
    e.preventDefault()
    if (!input.trim() || !selected || sending) return
    setSending(true)
    const text = input.trim()
    setInput('')

    await fetch('/api/whatsapp/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: text, phoneNumber: selected }),
    })
    setSending(false)
  }

  const canChat = linkedPhone && selected === linkedPhone

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

        {/* Linked number badge */}
        {linkedPhone && (
          <div className="px-4 py-2 bg-[#25D366]/5 border-b border-[#25D366]/10">
            <p className="text-xs text-[#25D366] font-medium flex items-center gap-1">
              <CheckCircle size={11} /> Linked: {linkedPhone}
            </p>
          </div>
        )}

        <div className="flex-1 overflow-y-auto divide-y divide-gray-100">
          {loading ? (
            <div className="p-6 text-center text-sm text-gray-400">Loading…</div>
          ) : sessions.length === 0 ? (
            <div className="p-6 text-center text-sm text-gray-400">No conversations yet</div>
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
                  <div className="flex items-center gap-1">
                    <p className="text-sm font-medium text-gray-900 truncate">{s.phone_number}</p>
                    {s.phone_number === linkedPhone && (
                      <span className="text-[10px] font-semibold text-[#25D366] bg-[#25D366]/10 px-1.5 py-0.5 rounded-full shrink-0">You</span>
                    )}
                  </div>
                  <p className="text-xs text-gray-400">{timeAgo(s.last_active_at)}</p>
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Chat panel */}
      <div className="flex-1 flex flex-col bg-gray-50 min-w-0">
        {loading ? (
          <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">Loading…</div>
        ) : !linkedPhone ? (
          <LinkPhoneCard onLinked={phone => {
            setLinkedPhone(phone)
            setSelected(phone)
            setSessions(prev => {
              if (prev.find(s => s.phone_number === phone)) return prev
              return [{ phone_number: phone, last_active_at: new Date().toISOString() }, ...prev]
            })
          }} />
        ) : !selected ? (
          <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
            Select a conversation
          </div>
        ) : (
          <>
            {/* Chat header */}
            <div className="px-5 py-3 bg-white border-b border-gray-200 flex items-center gap-3 shrink-0">
              <div className="w-8 h-8 rounded-full bg-[#25D366] flex items-center justify-center">
                <MessageSquare size={14} className="text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-gray-900 text-sm">{selected}</p>
                <p className="text-xs text-gray-400">
                  {selected === linkedPhone ? 'Your WhatsApp · TrueFlow Bot' : 'WhatsApp · TrueFlow Bot'}
                </p>
              </div>
              {selected === linkedPhone && (
                <span className="text-xs bg-[#25D366]/10 text-[#25D366] font-semibold px-2 py-1 rounded-full">Live</span>
              )}
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
              {msgLoading ? (
                <div className="text-center text-sm text-gray-400 py-8">Loading messages…</div>
              ) : messages.length === 0 ? (
                <div className="text-center text-sm text-gray-400 py-8">
                  {canChat ? 'Send a message to start chatting with TrueFlow' : 'No messages yet'}
                </div>
              ) : messages.map(msg => (
                <div key={msg.id} className={cn('flex', msg.role === 'user' ? 'justify-end' : 'justify-start')}>
                  <div className={cn(
                    'max-w-[70%] rounded-2xl px-4 py-2.5 text-sm shadow-sm',
                    msg.role === 'user'
                      ? 'bg-[#25D366] text-white rounded-br-sm'
                      : 'bg-white text-gray-800 rounded-bl-sm border border-gray-100'
                  )}>
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
              {sending && (
                <div className="flex justify-start">
                  <div className="bg-white border border-gray-100 rounded-2xl rounded-bl-sm px-4 py-3 shadow-sm">
                    <div className="flex gap-1 items-center">
                      <span className="w-2 h-2 bg-gray-300 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                      <span className="w-2 h-2 bg-gray-300 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                      <span className="w-2 h-2 bg-gray-300 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                    </div>
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </div>

            {/* Message input — only shown for user's own linked number */}
            {canChat ? (
              <form onSubmit={sendMessage} className="px-4 py-3 bg-white border-t border-gray-200 flex items-center gap-3 shrink-0">
                <input
                  className="flex-1 text-sm bg-gray-100 rounded-full px-4 py-2.5 outline-none focus:ring-2 focus:ring-[#25D366]/30 placeholder:text-gray-400"
                  placeholder="Message TrueFlow…"
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  disabled={sending}
                />
                <button
                  type="submit"
                  disabled={!input.trim() || sending}
                  className="w-10 h-10 rounded-full bg-[#25D366] hover:bg-[#1ebe5d] flex items-center justify-center transition-colors disabled:opacity-40 shrink-0"
                >
                  <Send size={16} className="text-white" />
                </button>
              </form>
            ) : (
              <div className="px-4 py-3 bg-gray-100 border-t border-gray-200 text-center shrink-0">
                <p className="text-xs text-gray-400">Read-only view — this is not your linked number</p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
