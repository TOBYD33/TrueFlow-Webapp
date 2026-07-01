'use client'
// whatsapp/page.tsx
// Two-channel AI assistant panel.
// Tab 1 — TrueFlow Chat: built-in AI chat with image scanning, budgets,
//          reminders — works for any user, no WhatsApp required.
// Tab 2 — WhatsApp Bot: view/send messages via the linked WhatsApp number.

import { useEffect, useState, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { useViewingContext } from '@/components/ViewingContext'
import {
  MessageSquare, Send, CheckCircle,
  Paperclip, X, Bot, Smartphone,
} from 'lucide-react'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Session { phone_number: string; last_active_at: string }
interface Message { id: string; phone_number: string; role: 'user' | 'assistant'; content: string; created_at: string }

// ── Helpers ───────────────────────────────────────────────────────────────────

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

// Renders **bold** text from AI replies
function FormattedText({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g)
  return (
    <span>
      {parts.map((part, i) =>
        part.startsWith('**') && part.endsWith('**')
          ? <strong key={i}>{part.slice(2, -2)}</strong>
          : <span key={i}>{part}</span>
      )}
    </span>
  )
}

function MessageBubble({ msg, accent }: { msg: Message; accent: 'purple' | 'green' }) {
  const isUser = msg.role === 'user'
  const lines = msg.content.split('\n')
  const userBg = accent === 'purple' ? 'bg-[#6C63FF]' : 'bg-[#25D366]'
  const userTime = accent === 'purple' ? 'text-purple-200' : 'text-green-100'
  return (
    <div className={cn('flex', isUser ? 'justify-end' : 'justify-start')}>
      <div className={cn(
        'max-w-[72%] rounded-2xl px-4 py-2.5 text-sm shadow-sm',
        isUser ? `${userBg} text-white rounded-br-sm` : 'bg-white text-gray-800 rounded-bl-sm border border-gray-100'
      )}>
        <div className="whitespace-pre-wrap leading-relaxed space-y-0.5">
          {lines.map((line, i) => <p key={i}><FormattedText text={line} /></p>)}
        </div>
        <p className={cn('text-xs mt-1.5 text-right', isUser ? userTime : 'text-gray-400')}>
          {new Date(msg.created_at).toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' })}
        </p>
      </div>
    </div>
  )
}

function TypingIndicator({ label }: { label?: string }) {
  return (
    <div className="flex justify-start items-end gap-2">
      <div className="w-7 h-7 rounded-full bg-[#6C63FF] flex items-center justify-center shrink-0 mb-0.5">
        <Bot size={13} className="text-white" />
      </div>
      <div className="bg-white border border-gray-100 rounded-2xl rounded-bl-sm px-4 py-3 shadow-sm">
        <div className="flex gap-1 items-center">
          <div className="flex gap-1">
            {[0, 150, 300].map(delay => (
              <span key={delay} className="w-1.5 h-1.5 bg-[#6C63FF]/50 rounded-full animate-bounce" style={{ animationDelay: `${delay}ms` }} />
            ))}
          </div>
          {label && <span className="text-xs text-gray-400 ml-1">{label}</span>}
        </div>
      </div>
    </div>
  )
}

// ── WhatsApp phone linking flow ───────────────────────────────────────────────

function LinkPhoneCard({ onLinked }: { onLinked: (phone: string) => void }) {
  const [step, setStep] = useState<'prompt' | 'phone' | 'otp' | 'done'>('prompt')
  const [phone, setPhone] = useState('')
  const [normPhone, setNormPhone] = useState('')
  const [otp, setOtp] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function sendCode(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true); setError(null)
    const res = await fetch('/api/auth/whatsapp/send-otp', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone }),
    })
    const json = await res.json()
    setBusy(false)
    if (!res.ok) { setError(json.error || 'Failed to send code.'); return }
    setNormPhone(json.phone); setStep('otp')
  }

  async function verifyAndLink(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true); setError(null)
    const res = await fetch('/api/whatsapp/link-phone', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: normPhone, code: otp }),
    })
    const json = await res.json()
    setBusy(false)
    if (!res.ok) { setError(json.error || 'Verification failed.'); return }
    setStep('done')
    setTimeout(() => onLinked(normPhone), 900)
  }

  if (step === 'prompt') return (
    <div className="flex-1 flex items-center justify-center p-8">
      <div className="max-w-xs w-full text-center">
        <div className="w-14 h-14 rounded-full bg-[#25D366]/10 flex items-center justify-center mx-auto mb-4">
          <Smartphone size={24} className="text-[#25D366]" />
        </div>
        <h3 className="font-semibold text-gray-900 mb-2">Link your WhatsApp</h3>
        <p className="text-sm text-gray-500 mb-5">Connect your WhatsApp number to view your bot conversation history and send messages from here.</p>
        <button onClick={() => setStep('phone')} className="w-full h-10 rounded-lg bg-[#25D366] hover:bg-[#1ebe5d] text-white text-sm font-semibold transition-colors">
          Link WhatsApp number
        </button>
        <p className="text-xs text-gray-400 mt-3">Don't use WhatsApp? Use <strong>TrueFlow Chat</strong> instead — no phone needed.</p>
      </div>
    </div>
  )

  if (step === 'phone') return (
    <div className="flex-1 flex items-center justify-center p-8">
      <div className="max-w-xs w-full">
        <h3 className="font-semibold text-gray-900 mb-1">Enter your WhatsApp number</h3>
        <p className="text-sm text-gray-500 mb-4">We'll send a 6-digit code to verify it's yours.</p>
        <form onSubmit={sendCode} className="space-y-3">
          <Input type="tel" placeholder="+2348012345678" value={phone} onChange={e => setPhone(e.target.value)} required />
          <p className="text-xs text-gray-400">Include country code — e.g. +234 for Nigeria</p>
          {error && <p className="text-sm text-red-500">{error}</p>}
          <button type="submit" disabled={busy} className="w-full h-10 rounded-lg bg-[#25D366] hover:bg-[#1ebe5d] text-white text-sm font-semibold transition-colors disabled:opacity-60">
            {busy ? 'Sending…' : 'Send Code via WhatsApp'}
          </button>
        </form>
      </div>
    </div>
  )

  if (step === 'otp') return (
    <div className="flex-1 flex items-center justify-center p-8">
      <div className="max-w-xs w-full">
        <h3 className="font-semibold text-gray-900 mb-1">Enter the code</h3>
        <p className="text-sm text-gray-500 mb-4">Sent to <span className="font-semibold">{normPhone}</span> on WhatsApp.</p>
        <form onSubmit={verifyAndLink} className="space-y-3">
          <Input className="text-center text-xl tracking-widest font-mono" type="text" inputMode="numeric" maxLength={6} placeholder="000000" value={otp} onChange={e => setOtp(e.target.value.replace(/\D/g, ''))} required />
          {error && <p className="text-sm text-red-500">{error}</p>}
          <button type="submit" disabled={busy || otp.length !== 6} className="w-full h-10 rounded-lg bg-[#25D366] hover:bg-[#1ebe5d] text-white text-sm font-semibold transition-colors disabled:opacity-60">
            {busy ? 'Linking…' : 'Verify & Link'}
          </button>
          <button type="button" onClick={() => setStep('phone')} className="w-full text-xs text-gray-400 hover:text-gray-600 text-center">Use a different number</button>
        </form>
      </div>
    </div>
  )

  return (
    <div className="flex-1 flex items-center justify-center p-8">
      <div className="text-center">
        <CheckCircle size={44} className="text-[#25D366] mx-auto mb-3" />
        <p className="font-semibold text-gray-900">WhatsApp linked!</p>
        <p className="text-sm text-gray-400 mt-1">Loading your conversations…</p>
      </div>
    </div>
  )
}

// ── Tab 1: TrueFlow Chat ──────────────────────────────────────────────────────

function TrueFlowChatPanel({ userId }: { userId: string }) {
  const supabase = createClient()
  const chatId = `web:${userId}`
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [previewImg, setPreviewImg] = useState<string | null>(null)
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const [msgLoading, setMsgLoading] = useState(true)
  const bottomRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    async function load() {
      setMsgLoading(true)
      const { data } = await supabase
        .from('whatsapp_conversations')
        .select('*')
        .eq('phone_number', chatId)
        .order('created_at', { ascending: true })
        .limit(100)
      setMessages((data as Message[]) ?? [])
      setMsgLoading(false)
    }
    load()
  }, [userId])

  // Real-time as backup only — primary updates come directly from API response below
  useEffect(() => {
    const channel = supabase
      .channel(`truechat:${userId}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'whatsapp_conversations',
        filter: `phone_number=eq.web%3A${userId}`,
      }, payload => {
        const incoming = payload.new as Message
        setMessages(prev => {
          // Deduplicate: skip if same content+role arrived within 10 seconds
          const isDup = prev.some(m =>
            m.role === incoming.role &&
            m.content === incoming.content &&
            Math.abs(new Date(m.created_at).getTime() - new Date(incoming.created_at).getTime()) < 10000
          )
          return isDup ? prev : [...prev, incoming]
        })
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [userId])

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages, sending, scanning])

  async function sendText(e: React.FormEvent) {
    e.preventDefault()
    if (!input.trim() || sending) return
    const text = input.trim()
    setInput('')
    setSending(true)

    const now = new Date().toISOString()
    const tempUserId = `local-user-${Date.now()}`
    // Add user message immediately
    setMessages(prev => [...prev, { id: tempUserId, phone_number: chatId, role: 'user', content: text, created_at: now }])

    const res = await fetch('/api/chat/message', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: text }),
    })
    const json = await res.json()
    setSending(false)

    if (res.ok && json.reply) {
      // Add bot reply directly — no waiting for real-time
      setMessages(prev => [...prev, {
        id: `local-bot-${Date.now()}`,
        phone_number: chatId,
        role: 'assistant',
        content: json.reply,
        created_at: new Date().toISOString(),
      }])
    } else {
      setMessages(prev => [...prev, {
        id: `err-${Date.now()}`,
        phone_number: chatId,
        role: 'assistant',
        content: `⚠️ ${json.error ?? 'Something went wrong. Please try again.'}`,
        created_at: new Date().toISOString(),
      }])
    }
  }

  function onFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setPendingFile(file)
    setPreviewImg(URL.createObjectURL(file))
    e.target.value = ''
  }

  async function sendImage() {
    if (!pendingFile || scanning) return
    setScanning(true)
    setPreviewImg(null)
    const tempId = `img-${Date.now()}`
    setMessages(prev => [...prev, { id: tempId, phone_number: chatId, role: 'user', content: '📎 [Image uploaded — scanning…]', created_at: new Date().toISOString() }])
    const form = new FormData()
    form.append('image', pendingFile)
    setPendingFile(null)
    const res = await fetch('/api/chat/scan', { method: 'POST', body: form })
    const json = await res.json()
    setScanning(false)
    // Replace temp with the real image message
    setMessages(prev => prev.map(m => m.id === tempId
      ? { ...m, content: '📎 [Image uploaded]' }
      : m
    ))
    if (res.ok && json.reply) {
      setMessages(prev => [...prev, {
        id: `scan-bot-${Date.now()}`,
        phone_number: chatId,
        role: 'assistant',
        content: json.reply,
        created_at: new Date().toISOString(),
      }])
    } else {
      setMessages(prev => [...prev, {
        id: `err-${Date.now()}`,
        phone_number: chatId,
        role: 'assistant',
        content: `⚠️ ${json.error ?? 'Could not process that image. Please try a clearer photo.'}`,
        created_at: new Date().toISOString(),
      }])
    }
  }

  const suggestions = [
    'I spent ₦15,000 on fuel today',
    'Set a transport budget of ₦80,000',
    'Remind me to pay rent on the 1st',
    'How much did I spend this month?',
  ]

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-gray-50">
      <div className="px-5 py-3 bg-white border-b border-gray-200 flex items-center gap-3 shrink-0">
        <div className="w-9 h-9 rounded-full bg-[#6C63FF] flex items-center justify-center">
          <Bot size={16} className="text-white" />
        </div>
        <div>
          <p className="text-sm font-semibold text-gray-900">TrueFlow AI Assistant</p>
          <p className="text-xs text-gray-400">Track expenses · Set budgets · Log income · Upload receipts</p>
        </div>
        <span className="ml-auto text-xs bg-[#6C63FF]/10 text-[#6C63FF] font-semibold px-2 py-1 rounded-full">Live</span>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3 max-w-3xl w-full mx-auto self-center" style={{ width: '100%' }}>
        {msgLoading ? (
          <div className="text-center text-sm text-gray-400 py-8">Loading…</div>
        ) : messages.length === 0 ? (
          <div className="text-center py-10">
            <Bot size={40} className="text-gray-200 mx-auto mb-4" />
            <p className="font-semibold text-gray-700 mb-2">Hello! I'm your TrueFlow assistant.</p>
            <p className="text-sm text-gray-400 max-w-xs mx-auto mb-6">
              Track expenses, set budgets, manage reminders, and scan receipts — all without WhatsApp.
            </p>
            <div className="grid grid-cols-2 gap-2 text-xs text-left max-w-sm mx-auto">
              {suggestions.map(s => (
                <button key={s} onClick={() => setInput(s)}
                  className="bg-white border border-gray-200 hover:border-[#6C63FF]/40 hover:bg-[#6C63FF]/5 text-gray-600 rounded-xl px-3 py-2.5 text-left transition-colors">
                  "{s}"
                </button>
              ))}
            </div>
          </div>
        ) : messages.map(msg => (
          <MessageBubble key={msg.id} msg={msg} accent="purple" />
        ))}
        {sending && <TypingIndicator label="TrueFlow is thinking…" />}
        {scanning && <TypingIndicator label="Scanning your image…" />}
        <div ref={bottomRef} />
      </div>

      {previewImg && (
        <div className="px-5 py-2 bg-white border-t border-gray-100 flex items-center gap-3 shrink-0 max-w-3xl mx-auto w-full">
          <div className="relative">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={previewImg} alt="Preview" className="h-14 w-14 object-cover rounded-lg border border-gray-200" />
            <button onClick={() => { setPreviewImg(null); setPendingFile(null) }}
              className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-gray-700 rounded-full flex items-center justify-center">
              <X size={10} className="text-white" />
            </button>
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-gray-700">{pendingFile?.name}</p>
            <p className="text-xs text-gray-400">TrueFlow will scan and save it automatically</p>
          </div>
          <button onClick={sendImage} disabled={scanning}
            className="h-9 px-4 rounded-lg bg-[#6C63FF] hover:bg-[#5a52d5] text-white text-sm font-semibold transition-colors disabled:opacity-60">
            {scanning ? 'Scanning…' : 'Scan & Save'}
          </button>
        </div>
      )}

      <div className="px-4 py-3 bg-white border-t border-gray-200 shrink-0 max-w-3xl mx-auto w-full">
        <form onSubmit={sendText} className="flex items-center gap-2">
          <button type="button" onClick={() => fileInputRef.current?.click()}
            className="w-9 h-9 rounded-full hover:bg-gray-100 flex items-center justify-center transition-colors shrink-0"
            title="Upload receipt or payment proof">
            <Paperclip size={17} className="text-gray-400" />
          </button>
          <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={onFileSelect} />
          <input
            className="flex-1 text-sm bg-gray-100 rounded-full px-4 py-2.5 outline-none focus:ring-2 focus:ring-[#6C63FF]/30 placeholder:text-gray-400"
            placeholder="Ask TrueFlow anything — or describe an expense…"
            value={input} onChange={e => setInput(e.target.value)} disabled={sending}
          />
          <button type="submit" disabled={!input.trim() || sending}
            className="w-9 h-9 rounded-full bg-[#6C63FF] hover:bg-[#5a52d5] flex items-center justify-center transition-colors disabled:opacity-40 shrink-0">
            <Send size={15} className="text-white" />
          </button>
        </form>
        <p className="text-[10px] text-gray-300 text-center mt-1.5">Budgets and reminders are saved directly to your account</p>
      </div>
    </div>
  )
}

// ── Tab 2: WhatsApp Bot ───────────────────────────────────────────────────────

function WhatsAppBotPanel({
  linkedPhone, sessions, selected, messages, msgLoading,
  onSelectSession, onLinked, onSendMessage,
}: {
  linkedPhone: string | null
  sessions: Session[]
  selected: string | null
  messages: Message[]
  msgLoading: boolean
  onSelectSession: (phone: string) => void
  onLinked: (phone: string) => void
  onSendMessage: (msg: string) => Promise<void>
}) {
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const canChat = linkedPhone && selected === linkedPhone

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages, sending])

  async function handleSend(e: React.FormEvent) {
    e.preventDefault()
    if (!input.trim() || !selected || sending) return
    const text = input.trim()
    setInput('')
    setSending(true)
    await onSendMessage(text)
    setSending(false)
  }

  return (
    <div className="flex flex-1 min-h-0">
      {/* Sessions sidebar */}
      <div className="w-64 flex-shrink-0 border-r border-gray-200 bg-white flex flex-col">
        <div className="px-4 py-3 border-b border-gray-100">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Conversations</p>
          <p className="text-xs text-gray-400 mt-0.5">{sessions.length} session{sessions.length !== 1 ? 's' : ''}</p>
        </div>
        {linkedPhone && (
          <div className="px-4 py-2 bg-[#25D366]/5 border-b border-[#25D366]/10 shrink-0">
            <p className="text-xs text-[#25D366] font-medium flex items-center gap-1.5">
              <CheckCircle size={10} /> Linked: {linkedPhone}
            </p>
          </div>
        )}
        <div className="flex-1 overflow-y-auto divide-y divide-gray-50">
          {sessions.length === 0 ? (
            <div className="p-6 text-center text-xs text-gray-400">No conversations yet</div>
          ) : sessions.map(s => (
            <button key={s.phone_number} onClick={() => onSelectSession(s.phone_number)} className={cn(
              'w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors',
              selected === s.phone_number && 'bg-green-50 border-r-2 border-[#25D366]'
            )}>
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-full bg-[#25D366] flex items-center justify-center shrink-0">
                  <MessageSquare size={13} className="text-white" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1">
                    <p className="text-xs font-medium text-gray-900 truncate">{s.phone_number}</p>
                    {s.phone_number === linkedPhone && (
                      <span className="text-[9px] font-semibold text-[#25D366] bg-[#25D366]/10 px-1 py-0.5 rounded shrink-0">You</span>
                    )}
                  </div>
                  <p className="text-[11px] text-gray-400">{timeAgo(s.last_active_at)}</p>
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Chat area */}
      <div className="flex-1 flex flex-col min-w-0 bg-gray-50">
        {!linkedPhone ? (
          <LinkPhoneCard onLinked={onLinked} />
        ) : !selected ? (
          <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">Select a conversation</div>
        ) : (
          <>
            <div className="px-4 py-3 bg-white border-b border-gray-200 flex items-center gap-3 shrink-0">
              <div className="w-8 h-8 rounded-full bg-[#25D366] flex items-center justify-center">
                <MessageSquare size={13} className="text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900">{selected}</p>
                <p className="text-xs text-gray-400">{selected === linkedPhone ? 'Your WhatsApp · TrueFlow Bot' : 'Team member · read only'}</p>
              </div>
              {selected === linkedPhone && <span className="text-xs bg-[#25D366]/10 text-[#25D366] font-semibold px-2 py-1 rounded-full">Live</span>}
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
              {msgLoading ? (
                <div className="text-center text-sm text-gray-400 py-8">Loading messages…</div>
              ) : messages.length === 0 ? (
                <div className="text-center py-12">
                  <MessageSquare size={32} className="text-gray-200 mx-auto mb-3" />
                  <p className="text-sm text-gray-400">{canChat ? 'Send a message to chat with TrueFlow via WhatsApp' : 'No messages yet'}</p>
                </div>
              ) : messages.map(msg => <MessageBubble key={msg.id} msg={msg} accent="green" />)}
              {sending && <TypingIndicator label="Sending…" />}
              <div ref={bottomRef} />
            </div>

            {canChat ? (
              <form onSubmit={handleSend} className="px-4 py-3 bg-white border-t border-gray-200 flex items-center gap-2 shrink-0">
                <input
                  className="flex-1 text-sm bg-gray-100 rounded-full px-4 py-2.5 outline-none focus:ring-2 focus:ring-[#25D366]/30 placeholder:text-gray-400"
                  placeholder="Message via WhatsApp…"
                  value={input} onChange={e => setInput(e.target.value)} disabled={sending}
                />
                <button type="submit" disabled={!input.trim() || sending}
                  className="w-9 h-9 rounded-full bg-[#25D366] hover:bg-[#1ebe5d] flex items-center justify-center transition-colors disabled:opacity-40 shrink-0">
                  <Send size={15} className="text-white" />
                </button>
              </form>
            ) : (
              <div className="px-4 py-3 bg-gray-100 border-t border-gray-200 text-center shrink-0">
                <p className="text-xs text-gray-400">Read-only — this is not your linked number</p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function WhatsAppPage() {
  const supabase = createClient()
  const { orgId, userId, phone: contextPhone } = useViewingContext()
  const [activeTab, setActiveTab] = useState<'chat' | 'whatsapp'>('chat')
  const [linkedPhone, setLinkedPhone] = useState<string | null>(null)
  const [sessions, setSessions] = useState<Session[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [msgLoading, setMsgLoading] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!orgId || !userId) return
    async function init() {
      try {
        const phone = contextPhone ?? null
        setLinkedPhone(phone)

        const { data: orgSessions } = await supabase
          .from('whatsapp_sessions')
          .select('phone_number, last_active_at')
          .eq('org_id', orgId)
          .order('last_active_at', { ascending: false })

        let list = (orgSessions as Session[]) ?? []
        if (phone && !list.find(s => s.phone_number === phone)) {
          list = [{ phone_number: phone, last_active_at: new Date().toISOString() }, ...list]
        }
        setSessions(list)
        setSelected(phone ?? list[0]?.phone_number ?? null)
      } finally {
        setLoading(false)
      }
    }
    init()
  }, [orgId, userId, contextPhone])

  // Load WhatsApp messages when session selected
  useEffect(() => {
    if (!selected || activeTab !== 'whatsapp') return
    async function load() {
      setMsgLoading(true)
      const { data } = await supabase
        .from('whatsapp_conversations')
        .select('*')
        .eq('phone_number', selected!)
        .order('created_at', { ascending: true })
        .limit(100)
      setMessages((data as Message[]) ?? [])
      setMsgLoading(false)
    }
    load()
  }, [selected, activeTab])

  // Realtime for WhatsApp tab
  useEffect(() => {
    if (!selected || activeTab !== 'whatsapp') return
    const channel = supabase
      .channel(`wa:${selected}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'whatsapp_conversations',
        filter: `phone_number=eq.${selected}`,
      }, payload => {
        setMessages(prev => {
          const exists = prev.some(m => m.id === (payload.new as Message).id)
          return exists ? prev : [...prev, payload.new as Message]
        })
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [selected, activeTab])

  const handleSendWhatsApp = useCallback(async (text: string) => {
    if (!selected) return
    await fetch('/api/whatsapp/chat', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: text, phoneNumber: selected }),
    })
  }, [selected])

  const handleLinked = useCallback((phone: string) => {
    setLinkedPhone(phone)
    setSelected(phone)
    setSessions(prev => prev.find(s => s.phone_number === phone)
      ? prev
      : [{ phone_number: phone, last_active_at: new Date().toISOString() }, ...prev]
    )
  }, [])

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] -m-6 overflow-hidden">
      {/* Tab bar */}
      <div className="bg-white border-b border-gray-200 px-6 flex items-center gap-0 shrink-0">
        <button
          onClick={() => setActiveTab('chat')}
          className={cn(
            'flex items-center gap-2 px-5 py-3.5 text-sm font-semibold border-b-2 transition-colors',
            activeTab === 'chat' ? 'border-[#6C63FF] text-[#6C63FF]' : 'border-transparent text-gray-500 hover:text-gray-700'
          )}
        >
          <Bot size={15} />
          TrueFlow Chat
          <span className="text-[10px] font-bold text-white bg-[#6C63FF] px-1.5 py-0.5 rounded-full">AI</span>
        </button>
        <button
          onClick={() => setActiveTab('whatsapp')}
          className={cn(
            'flex items-center gap-2 px-5 py-3.5 text-sm font-semibold border-b-2 transition-colors',
            activeTab === 'whatsapp' ? 'border-[#25D366] text-[#25D366]' : 'border-transparent text-gray-500 hover:text-gray-700'
          )}
        >
          <MessageSquare size={15} />
          WhatsApp Bot
          {linkedPhone && <CheckCircle size={12} className="text-[#25D366]" />}
        </button>
      </div>

      {loading ? (
        <div className="flex-1 flex items-center justify-center text-sm text-gray-400">Loading…</div>
      ) : activeTab === 'chat' && userId ? (
        <TrueFlowChatPanel userId={userId} />
      ) : activeTab === 'whatsapp' ? (
        <WhatsAppBotPanel
          linkedPhone={linkedPhone}
          sessions={sessions}
          selected={selected}
          messages={messages}
          msgLoading={msgLoading}
          onSelectSession={setSelected}
          onLinked={handleLinked}
          onSendMessage={handleSendWhatsApp}
        />
      ) : null}
    </div>
  )
}
