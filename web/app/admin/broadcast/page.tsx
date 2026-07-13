'use client'
// app/admin/broadcast/page.tsx
// Broadcast tool — Super Admin only (the API enforces this; the nav hides
// it for other roles). Compose → audience filter → channel → live recipient
// preview → typed "Send" confirmation for >50 recipients → send once
// (button disables immediately to prevent double-sends).

import { useEffect, useState } from 'react'
import { ThemedCard, PageHeader } from '@/components/shared/Cards'
import { useTheme, tone, BRAND } from '@/components/shared/theme'
import { toast } from 'sonner'
import { Megaphone } from 'lucide-react'

const PLANS = ['free', 'individual', 'family', 'freelancer', 'sme_starter', 'agency', 'sme_pro', 'studio']
const COUNTRIES = ['Nigeria', 'Kenya', 'Ghana', 'USA', 'UK']
const CONFIRM_THRESHOLD = 50

export default function AdminBroadcastPage() {
  const { dark } = useTheme()
  const t = tone(dark)

  const [message, setMessage] = useState('')
  const [audience, setAudience] = useState<'all' | 'plan' | 'inactive' | 'country'>('all')
  const [plan, setPlan] = useState('free')
  const [country, setCountry] = useState('Nigeria')
  const [channel, setChannel] = useState<'whatsapp' | 'email' | 'both'>('whatsapp')
  const [preview, setPreview] = useState<{ count: number; withWhatsApp: number; withEmail: number } | null>(null)
  const [confirmText, setConfirmText] = useState('')
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState<{ recipients: number; sentWhatsApp: number; sentEmail: number } | null>(null)
  const [forbidden, setForbidden] = useState(false)

  // Live recipient preview whenever the filter changes
  useEffect(() => {
    const params = new URLSearchParams({ audience })
    if (audience === 'plan') params.set('plan', plan)
    if (audience === 'country') params.set('country', country)
    setPreview(null)
    fetch(`/api/admin/broadcast?${params}`)
      .then(async r => {
        if (r.status === 403) { setForbidden(true); return null }
        return r.json()
      })
      .then(json => { if (json && json.count !== undefined) setPreview(json) })
      .catch(() => {})
  }, [audience, plan, country])

  const needsTyped = (preview?.count ?? 0) > CONFIRM_THRESHOLD
  const canSend =
    !sending && !sent && message.trim().length > 0 && (preview?.count ?? 0) > 0 &&
    (!needsTyped || confirmText === 'Send')

  async function send() {
    if (!canSend) return
    setSending(true) // disable immediately — no double sends
    try {
      const res = await fetch('/api/admin/broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message,
          channel,
          filter: { audience, plan: audience === 'plan' ? plan : undefined, country: audience === 'country' ? country : undefined },
          confirmation: confirmText || undefined,
        }),
      })
      const json = await res.json()
      if (!res.ok) { toast.error(json.error ?? 'Broadcast failed'); setSending(false); return }
      setSent(json)
      toast.success(`Broadcast sent to ${json.recipients} recipients`)
    } catch {
      toast.error('Network error — broadcast may not have sent')
      setSending(false)
    }
  }

  if (forbidden) {
    return <p className="text-sm py-8" style={{ color: t.textDim }}>Broadcast is available to Super Admin only.</p>
  }

  const selectCls = 'h-10 px-3 rounded-xl border text-sm bg-transparent outline-none'
  const selectStyle = { borderColor: t.border, color: t.text, background: t.surface }

  return (
    <div className="max-w-2xl space-y-5">
      <PageHeader title="Broadcast" subtitle="Send an announcement to users — logged, previewed, and confirmed" />

      <ThemedCard title="Message">
        <textarea
          value={message}
          onChange={e => setMessage(e.target.value)}
          disabled={!!sent}
          rows={5}
          placeholder="Write your announcement… (plain text, sent as WhatsApp message and/or email)"
          className="w-full rounded-xl border p-3 text-sm outline-none resize-y bg-transparent"
          style={{ borderColor: t.border, color: t.text }}
        />
      </ThemedCard>

      <ThemedCard title="Audience & Channel">
        <div className="flex flex-wrap gap-3">
          <select className={selectCls} style={selectStyle} value={audience} onChange={e => setAudience(e.target.value as typeof audience)} disabled={!!sent}>
            <option value="all">All users</option>
            <option value="plan">By plan</option>
            <option value="inactive">Inactive 30+ days</option>
            <option value="country">By country</option>
          </select>
          {audience === 'plan' && (
            <select className={selectCls} style={selectStyle} value={plan} onChange={e => setPlan(e.target.value)}>
              {PLANS.map(p => <option key={p} value={p}>{p.replace('_', ' ')}</option>)}
            </select>
          )}
          {audience === 'country' && (
            <select className={selectCls} style={selectStyle} value={country} onChange={e => setCountry(e.target.value)}>
              {COUNTRIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          )}
          <select className={selectCls} style={selectStyle} value={channel} onChange={e => setChannel(e.target.value as typeof channel)} disabled={!!sent}>
            <option value="whatsapp">WhatsApp</option>
            <option value="email">Email</option>
            <option value="both">Both</option>
          </select>
        </div>

        {/* Recipient preview */}
        <div className="mt-4 rounded-xl border p-4" style={{ borderColor: t.border, background: t.hover }}>
          {preview === null ? (
            <p className="text-sm" style={{ color: t.textDim }}>Counting recipients…</p>
          ) : (
            <p className="text-sm" style={{ color: t.text }}>
              This will reach <strong style={{ color: BRAND.violet }}>{preview.count}</strong> recipient{preview.count === 1 ? '' : 's'}
              <span style={{ color: t.textDim }}> · {preview.withWhatsApp} with WhatsApp · {preview.withEmail} with email</span>
            </p>
          )}
        </div>
      </ThemedCard>

      <ThemedCard>
        {needsTyped && !sent && (
          <div className="mb-4">
            <label className="text-xs" style={{ color: t.textDim }}>
              This broadcast reaches more than {CONFIRM_THRESHOLD} recipients. Type <span className="font-mono font-bold" style={{ color: t.text }}>Send</span> to enable the button:
            </label>
            <input
              value={confirmText}
              onChange={e => setConfirmText(e.target.value)}
              placeholder="Send"
              className="w-full mt-1.5 h-10 px-3 rounded-xl border text-sm bg-transparent outline-none"
              style={{ borderColor: t.border, color: t.text }}
            />
          </div>
        )}

        {sent ? (
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full flex items-center justify-center" style={{ background: 'rgba(0,212,170,0.12)' }}>
              <Megaphone size={16} style={{ color: BRAND.mintDeep }} />
            </div>
            <p className="text-sm" style={{ color: t.text }}>
              Sent to {sent.recipients} recipients — {sent.sentWhatsApp} WhatsApp, {sent.sentEmail} email.
            </p>
          </div>
        ) : (
          <button
            onClick={send}
            disabled={!canSend}
            className="h-11 px-6 rounded-xl text-sm font-semibold text-white disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-2"
            style={{ background: BRAND.violet }}
          >
            <Megaphone size={15} />
            {sending ? 'Sending…' : 'Send Broadcast'}
          </button>
        )}
      </ThemedCard>
    </div>
  )
}
