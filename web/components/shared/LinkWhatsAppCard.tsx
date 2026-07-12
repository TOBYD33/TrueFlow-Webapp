'use client'
// components/shared/LinkWhatsAppCard.tsx
// Flow 2 of the Cross-Channel Identity Merge: optional card on
// /settings/profile for web-first users with no phone on file.
// Phone → code sent via the WhatsApp bot → code entry (3 attempts,
// graceful failure, no lockout) → merged.

import { useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { MessageCircle, Check } from 'lucide-react'
import { toast } from 'sonner'

type Stage = 'offer' | 'code' | 'done'

export function LinkWhatsAppCard({ onLinked }: { onLinked?: () => void }) {
  const [stage, setStage] = useState<Stage>('offer')
  const [phone, setPhone] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [notFoundMsg, setNotFoundMsg] = useState<string | null>(null)

  async function start() {
    if (!phone.trim()) return
    setBusy(true)
    setNotFoundMsg(null)
    try {
      const res = await fetch('/api/link-whatsapp/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone }),
      })
      const json = await res.json()
      if (!res.ok) { toast.error(json.error ?? 'Could not start the link.'); return }
      if (json.found === false) { setNotFoundMsg(json.message); return }
      setStage('code')
      toast.success('Code sent — check WhatsApp on that number')
    } catch {
      toast.error('Network error — please try again.')
    } finally {
      setBusy(false)
    }
  }

  async function verify() {
    if (!code.trim()) return
    setBusy(true)
    try {
      const res = await fetch('/api/link-whatsapp/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      })
      const json = await res.json()
      if (!res.ok) {
        setCode('') // clear the field, allow retry, no lockout
        toast.error(json.error ?? 'Verification failed.')
        if (json.ended) setStage('offer')
        return
      }
      setStage('done')
      toast.success('Accounts linked!')
      onLinked?.()
    } catch {
      toast.error('Network error — please try again.')
    } finally {
      setBusy(false)
    }
  }

  if (stage === 'done') {
    return (
      <Card className="border-[#00D4AA]/40">
        <CardContent className="pt-6 flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-[#00D4AA]/10 flex items-center justify-center">
            <Check size={17} className="text-[#00A88A]" />
          </div>
          <div>
            <p className="font-medium text-gray-900">WhatsApp linked</p>
            <p className="text-sm text-gray-500">Your WhatsApp and web accounts are now one. Refresh to see everything in one place.</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="border-[#6C63FF]/25">
      <CardContent className="pt-6">
        <div className="flex items-start gap-3 mb-4">
          <div className="w-9 h-9 rounded-full bg-[#25D366]/10 flex items-center justify-center shrink-0">
            <MessageCircle size={17} className="text-[#25D366]" />
          </div>
          <div>
            <p className="font-semibold text-gray-900">Also use TrueFlow on WhatsApp?</p>
            <p className="text-sm text-gray-500 mt-0.5">Link your number to sync everything in one place.</p>
          </div>
        </div>

        {stage === 'offer' && (
          <div className="space-y-3">
            <Input
              placeholder="+2348012345678"
              value={phone}
              onChange={e => setPhone(e.target.value)}
            />
            {notFoundMsg && <p className="text-sm text-amber-600">{notFoundMsg}</p>}
            <Button className="bg-[#6C63FF] hover:bg-[#5A52E0]" onClick={start} disabled={busy || !phone.trim()}>
              {busy ? 'Sending code…' : 'Send code to WhatsApp'}
            </Button>
          </div>
        )}

        {stage === 'code' && (
          <div className="space-y-3">
            <p className="text-sm text-gray-600">We&apos;ve sent a code to that number on WhatsApp, enter it below to confirm.</p>
            <Input
              placeholder="6-digit code"
              inputMode="numeric"
              maxLength={6}
              value={code}
              onChange={e => setCode(e.target.value.replace(/\D/g, ''))}
            />
            <div className="flex gap-2">
              <Button className="bg-[#6C63FF] hover:bg-[#5A52E0]" onClick={verify} disabled={busy || code.length !== 6}>
                {busy ? 'Verifying…' : 'Verify & Link'}
              </Button>
              <Button variant="outline" onClick={() => { setStage('offer'); setCode('') }}>Back</Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
