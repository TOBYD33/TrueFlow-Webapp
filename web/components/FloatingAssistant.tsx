'use client'
// FloatingAssistant.tsx
// Floating AI assistant widget — bottom-right of every page.
// Opens a mini chat panel with proactive account nudges + quick Q&A.

import { useState, useEffect, useRef, useCallback } from 'react'
import { X, Send, Sparkles, Loader2, ChevronDown } from 'lucide-react'
import { createClient } from '@/lib/supabase-browser'

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
}

function FormattedText({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g)
  return (
    <>
      {parts.map((part, i) =>
        part.startsWith('**') && part.endsWith('**')
          ? <strong key={i}>{part.slice(2, -2)}</strong>
          : <span key={i}>{part}</span>
      )}
    </>
  )
}

export function FloatingAssistant() {
  const supabase = createClient()
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [greeted, setGreeted] = useState(false)
  const [hasUnread, setHasUnread] = useState(true)
  const [userId, setUserId] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) setUserId(user.id)
    })
  }, [])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  useEffect(() => {
    if (open && !greeted && userId) {
      setHasUnread(false)
      sendGreeting()
    }
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 150)
    }
  }, [open, userId])

  async function sendGreeting() {
    setGreeted(true)
    setLoading(true)

    // Fetch quick account snapshot
    const { data: member } = await supabase
      .from('org_members')
      .select('org_id')
      .eq('user_id', userId!)
      .single()

    let contextSummary = ''
    if (member) {
      const now = new Date()
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]
      const today = now.toISOString().split('T')[0]

      const [receiptsRes, remindersRes, clientsRes] = await Promise.all([
        supabase.from('receipts').select('amount').eq('org_id', member.org_id).gte('date', monthStart),
        supabase.from('reminders').select('title, due_date').eq('org_id', member.org_id).eq('status', 'active').lte('due_date', today),
        supabase.from('clients').select('outstanding_balance').eq('org_id', member.org_id).eq('status', 'active').gt('outstanding_balance', 0),
      ])

      const totalSpent = (receiptsRes.data ?? []).reduce((s: number, r: { amount: number }) => s + Number(r.amount), 0)
      const overdueCount = remindersRes.data?.length ?? 0
      const outstanding = (clientsRes.data ?? []).reduce((s: number, c: { outstanding_balance: number }) => s + Number(c.outstanding_balance), 0)

      contextSummary = `Account snapshot: ₦${totalSpent.toLocaleString()} spent this month across ${receiptsRes.data?.length ?? 0} receipts. ${overdueCount} overdue reminder(s). ₦${outstanding.toLocaleString()} outstanding from clients.`
    }

    try {
      const res = await fetch('/api/chat/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: `[WIDGET_GREETING] Give me a brief, friendly account check-in. Be concise — 2-3 sentences max. Mention anything urgent like overdue reminders or unpaid balances. End with one specific action I should take today. Context: ${contextSummary}`,
          widget: true,
        }),
      })
      const json = await res.json()
      if (json.reply) {
        setMessages([{ id: 'greeting', role: 'assistant', content: json.reply }])
      }
    } catch {
      setMessages([{ id: 'greeting', role: 'assistant', content: "Hi! I'm Tello, your TrueFlow AI assistant. Ask me anything about your finances, or say 'what should I do today?' to get started." }])
    } finally {
      setLoading(false)
    }
  }

  const send = useCallback(async () => {
    const text = input.trim()
    if (!text || loading) return

    const userMsg: Message = { id: `u-${Date.now()}`, role: 'user', content: text }
    setMessages(prev => [...prev, userMsg])
    setInput('')
    setLoading(true)

    try {
      const res = await fetch('/api/chat/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text }),
      })
      const json = await res.json()
      if (json.reply) {
        setMessages(prev => [...prev, { id: `a-${Date.now()}`, role: 'assistant', content: json.reply }])
      }
    } catch {
      setMessages(prev => [...prev, { id: `err-${Date.now()}`, role: 'assistant', content: 'Something went wrong. Please try again.' }])
    } finally {
      setLoading(false)
    }
  }, [input, loading])

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  }

  const suggestions = ['What should I do today?', 'How much did I spend this month?', 'Do I have unpaid invoices?']

  return (
    <>
      {/* Floating button */}
      <button
        onClick={() => setOpen(o => !o)}
        className="fixed bottom-5 right-5 z-50 w-14 h-14 rounded-full shadow-lg flex items-center justify-center transition-all duration-200 hover:scale-110 active:scale-95"
        style={{ background: 'linear-gradient(135deg, #6C63FF, #8B7FFF)' }}
        aria-label="Open TrueFlow Assistant"
      >
        {open
          ? <ChevronDown size={22} className="text-white" />
          : <Sparkles size={22} className="text-white" />
        }
        {/* Unread dot */}
        {hasUnread && !open && (
          <span className="absolute top-1 right-1 w-3 h-3 bg-red-500 rounded-full border-2 border-white animate-pulse" />
        )}
      </button>

      {/* Chat panel */}
      {open && (
        <div
          className="fixed bottom-24 right-5 z-50 w-80 sm:w-96 bg-white rounded-2xl shadow-2xl border border-gray-100 flex flex-col overflow-hidden"
          style={{ maxHeight: '520px', boxShadow: '0 20px 60px rgba(108,99,255,0.18), 0 4px 20px rgba(0,0,0,0.1)' }}
        >
          {/* Header */}
          <div
            className="flex items-center gap-3 px-4 py-3 shrink-0"
            style={{ background: 'linear-gradient(135deg, #6C63FF, #8B7FFF)' }}
          >
            <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center shrink-0">
              <Sparkles size={16} className="text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white font-semibold text-sm leading-tight">Tello</p>
              <p className="text-white/70 text-xs">Your AI financial guide</p>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors shrink-0"
            >
              <X size={14} className="text-white" />
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 min-h-0">
            {messages.length === 0 && !loading && (
              <div className="text-center py-4">
                <p className="text-xs text-gray-400 mb-3">Ask me anything about your finances</p>
                <div className="space-y-2">
                  {suggestions.map(s => (
                    <button
                      key={s}
                      onClick={() => { setInput(s); setTimeout(() => inputRef.current?.focus(), 0) }}
                      className="w-full text-left text-xs px-3 py-2 rounded-lg border border-gray-200 text-gray-600 hover:border-violet-300 hover:bg-violet-50 hover:text-violet-700 transition-colors"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map(msg => (
              <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                {msg.role === 'assistant' && (
                  <div className="w-6 h-6 rounded-full flex items-center justify-center shrink-0 mr-2 mt-0.5" style={{ background: 'linear-gradient(135deg, #6C63FF, #8B7FFF)' }}>
                    <Sparkles size={10} className="text-white" />
                  </div>
                )}
                <div
                  className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm leading-relaxed ${
                    msg.role === 'user'
                      ? 'text-white rounded-br-sm'
                      : 'bg-gray-100 text-gray-800 rounded-bl-sm'
                  }`}
                  style={msg.role === 'user' ? { background: 'linear-gradient(135deg, #6C63FF, #8B7FFF)' } : {}}
                >
                  <FormattedText text={msg.content} />
                </div>
              </div>
            ))}

            {loading && (
              <div className="flex justify-start">
                <div className="w-6 h-6 rounded-full flex items-center justify-center shrink-0 mr-2 mt-0.5" style={{ background: 'linear-gradient(135deg, #6C63FF, #8B7FFF)' }}>
                  <Sparkles size={10} className="text-white" />
                </div>
                <div className="bg-gray-100 rounded-2xl rounded-bl-sm px-3 py-2.5 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 bg-violet-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-1.5 h-1.5 bg-violet-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-1.5 h-1.5 bg-violet-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            )}

            <div ref={bottomRef} />
          </div>

          {/* Suggestions after first message */}
          {messages.length > 0 && !loading && (
            <div className="px-4 pb-2 flex gap-2 overflow-x-auto shrink-0" style={{ msOverflowStyle: 'none', scrollbarWidth: 'none' }}>
              {['Overdue reminders', 'This month summary', 'Unpaid clients'].map(s => (
                <button
                  key={s}
                  onClick={() => { setInput(s); setTimeout(() => { inputRef.current?.focus() }, 0) }}
                  className="shrink-0 text-xs px-2.5 py-1 rounded-full border border-violet-200 text-violet-600 bg-violet-50 hover:bg-violet-100 transition-colors whitespace-nowrap"
                >
                  {s}
                </button>
              ))}
            </div>
          )}

          {/* Input */}
          <div className="px-3 pb-3 pt-1 shrink-0 border-t border-gray-100">
            <div className="flex items-center gap-2 bg-gray-50 rounded-xl px-3 py-2">
              <input
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKey}
                placeholder="Ask anything…"
                className="flex-1 bg-transparent text-sm text-gray-800 placeholder-gray-400 outline-none"
                disabled={loading}
              />
              <button
                onClick={send}
                disabled={!input.trim() || loading}
                className="w-7 h-7 rounded-lg flex items-center justify-center transition-all disabled:opacity-30"
                style={{ background: input.trim() && !loading ? 'linear-gradient(135deg, #6C63FF, #8B7FFF)' : '#e5e7eb' }}
              >
                {loading
                  ? <Loader2 size={13} className="animate-spin text-gray-400" />
                  : <Send size={13} className={input.trim() ? 'text-white' : 'text-gray-400'} />
                }
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
