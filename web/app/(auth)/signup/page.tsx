'use client'
// signup/page.tsx
// Account creation — WhatsApp sign-up (primary) + email/password (alternative).
// WhatsApp flow: phone → OTP → name + business → account created → dashboard.

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase-browser'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

// ── WhatsApp Sign Up ──────────────────────────────────────────────────────────

type WAStep = 'phone' | 'otp' | 'details' | 'loading'

function WhatsAppSignUp() {
  const [step, setStep]                     = useState<WAStep>('phone')
  const [phone, setPhone]                   = useState('')
  const [normalisedPhone, setNormalisedPhone] = useState('')
  const [otp, setOtp]                       = useState('')
  const [fullName, setFullName]             = useState('')
  const [businessName, setBusinessName]     = useState('')
  const [isExistingUser, setIsExistingUser] = useState(false)
  const [existingRedirect, setExistingRedirect] = useState('')
  const [error, setError]                   = useState<string | null>(null)
  const [busy, setBusy]                     = useState(false)

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

  async function verifyCode(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true); setError(null)

    const res = await fetch('/api/auth/whatsapp/verify-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: normalisedPhone, code: otp }),
    })
    const json = await res.json()
    setBusy(false)

    if (!res.ok || json.error) { setError(json.error || 'Verification failed.'); return }

    if (!json.isNewUser) {
      // Already has an account — sign them straight in
      setIsExistingUser(true)
      setExistingRedirect(json.redirect)
      setStep('loading')
      window.location.href = json.redirect
      return
    }

    // New user — collect name + business before creating account
    setStep('details')
  }

  async function completeSignup(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true); setError(null)

    const res = await fetch('/api/auth/whatsapp/complete-signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: normalisedPhone, fullName, businessName }),
    })
    const json = await res.json()
    setBusy(false)

    if (!res.ok || json.error) { setError(json.error || 'Could not create account.'); return }

    setStep('loading')
    window.location.href = json.redirect
  }

  return (
    <Card className="border-[#25D366]/30 bg-[#25D366]/5">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <svg viewBox="0 0 24 24" className="w-5 h-5 fill-[#25D366]">
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
          </svg>
          <CardTitle className="text-base text-gray-900">Sign up with WhatsApp</CardTitle>
        </div>
        <CardDescription className="text-xs mt-1">
          Use your WhatsApp number — no email or password needed.
        </CardDescription>
      </CardHeader>

      <CardContent>
        {/* Step 1 — phone */}
        {step === 'phone' && (
          <form onSubmit={sendCode} className="space-y-3">
            <div>
              <label className="text-sm font-medium text-gray-700">WhatsApp number</label>
              <Input
                className="mt-1"
                type="tel"
                placeholder="+2348012345678"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                required
              />
              <p className="text-xs text-gray-400 mt-1">Include your country code — e.g. +234 for Nigeria</p>
            </div>
            {error && <p className="text-sm text-red-500">{error}</p>}
            <button
              type="submit"
              disabled={busy}
              className="w-full h-10 rounded-lg bg-[#25D366] hover:bg-[#1ebe5d] text-white text-sm font-semibold transition-colors disabled:opacity-60"
            >
              {busy ? 'Sending…' : 'Send Code via WhatsApp'}
            </button>
          </form>
        )}

        {/* Step 2 — OTP */}
        {step === 'otp' && (
          <form onSubmit={verifyCode} className="space-y-3">
            <p className="text-sm text-gray-600">
              We sent a 6-digit code to <span className="font-semibold">{normalisedPhone}</span> on WhatsApp.
            </p>
            <div>
              <label className="text-sm font-medium text-gray-700">Enter code</label>
              <Input
                className="mt-1 text-center text-xl tracking-widest font-mono"
                type="text"
                inputMode="numeric"
                maxLength={6}
                placeholder="000000"
                value={otp}
                onChange={e => setOtp(e.target.value.replace(/\D/g, ''))}
                required
              />
            </div>
            {error && <p className="text-sm text-red-500">{error}</p>}
            <button
              type="submit"
              disabled={busy || otp.length !== 6}
              className="w-full h-10 rounded-lg bg-[#25D366] hover:bg-[#1ebe5d] text-white text-sm font-semibold transition-colors disabled:opacity-60"
            >
              {busy ? 'Verifying…' : 'Verify Code'}
            </button>
            <button
              type="button"
              onClick={() => { setStep('phone'); setOtp(''); setError(null) }}
              className="w-full text-xs text-gray-400 hover:text-gray-600 text-center"
            >
              Use a different number
            </button>
          </form>
        )}

        {/* Step 3 — name + business (new users only) */}
        {step === 'details' && (
          <form onSubmit={completeSignup} className="space-y-3">
            <div className="flex items-center gap-2 text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 mb-1">
              <span>✅</span>
              <span>Number verified — just a few details to finish.</span>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700">Your name</label>
              <Input
                className="mt-1"
                placeholder="Tobi Adeleke"
                value={fullName}
                onChange={e => setFullName(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700">Business name <span className="text-gray-400 font-normal">(optional)</span></label>
              <Input
                className="mt-1"
                placeholder="Adeleke Boutique"
                value={businessName}
                onChange={e => setBusinessName(e.target.value)}
              />
            </div>
            {error && <p className="text-sm text-red-500">{error}</p>}
            <button
              type="submit"
              disabled={busy || !fullName.trim()}
              className="w-full h-10 rounded-lg bg-[#25D366] hover:bg-[#1ebe5d] text-white text-sm font-semibold transition-colors disabled:opacity-60"
            >
              {busy ? 'Creating account…' : 'Create my account'}
            </button>
          </form>
        )}

        {/* Loading */}
        {step === 'loading' && (
          <div className="text-center py-4">
            <div className="w-6 h-6 border-2 border-[#25D366] border-t-transparent rounded-full animate-spin mx-auto mb-2" />
            <p className="text-sm text-gray-500">Setting up your account…</p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ── Email / Password Sign Up ──────────────────────────────────────────────────

function SignupForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = createClient()

  const inviteOrgId = searchParams.get('org')
  const inviteRole = (searchParams.get('role') as 'staff' | 'admin' | 'accountant') || 'staff'
  const [inviteOrgName, setInviteOrgName] = useState<string | null>(null)

  const [fullName, setFullName]         = useState('')
  const [businessName, setBusinessName] = useState('')
  const [email, setEmail]               = useState('')
  const [password, setPassword]         = useState('')
  const [loading, setLoading]           = useState(false)
  const [error, setError]               = useState<string | null>(null)

  useEffect(() => {
    if (!inviteOrgId) return
    supabase.from('organizations').select('name').eq('id', inviteOrgId).single()
      .then(({ data }) => setInviteOrgName(data?.name ?? null))
  }, [inviteOrgId])

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true); setError(null)

    const res = await fetch('/api/auth/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, fullName, businessName, inviteOrgId, inviteRole }),
    })
    const json = await res.json()

    if (!res.ok || json.error) {
      setError(json.error || 'Signup failed.')
      setLoading(false)
      return
    }

    // Sign in via magic link generated server-side
    window.location.href = json.redirect
  }

  return (
    <div className="space-y-4">
      {/* WhatsApp sign-up — shown first, unless it's an invite flow */}
      {!inviteOrgId && <WhatsAppSignUp />}

      {/* Divider */}
      <div className="flex items-center gap-3">
        <div className="flex-1 h-px bg-gray-200" />
        <span className="text-xs text-gray-400 whitespace-nowrap">or sign up with email</span>
        <div className="flex-1 h-px bg-gray-200" />
      </div>

      {/* Email sign-up */}
      <Card>
        <CardHeader>
          <CardTitle>{inviteOrgName ? `Join ${inviteOrgName}` : 'Create your account'}</CardTitle>
          <CardDescription>
            {inviteOrgName
              ? `You've been invited to join ${inviteOrgName} on TrueFlow`
              : 'Free forever — no credit card needed'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSignup} className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">Your name</label>
              <Input placeholder="Tobi Adeleke" value={fullName} onChange={e => setFullName(e.target.value)} required />
            </div>
            {!inviteOrgId && (
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">Business name</label>
                <Input placeholder="Adeleke Boutique" value={businessName} onChange={e => setBusinessName(e.target.value)} />
              </div>
            )}
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">Email</label>
              <Input type="email" placeholder="you@example.com" value={email} onChange={e => setEmail(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">Password</label>
              <Input type="password" placeholder="Min 6 characters" value={password} onChange={e => setPassword(e.target.value)} minLength={6} required />
            </div>
            {error && <p className="text-sm text-red-500">{error}</p>}
            <Button type="submit" className="w-full bg-emerald-600 hover:bg-emerald-700" disabled={loading}>
              {loading ? 'Creating account…' : inviteOrgName ? `Join ${inviteOrgName}` : 'Create free account'}
            </Button>
          </form>
          <p className="text-center text-sm text-gray-500 mt-4">
            Already have an account?{' '}
            <Link href="/login" className="text-emerald-600 hover:underline font-medium">Sign in</Link>
          </p>
        </CardContent>
      </Card>
    </div>
  )
}

export default function SignupPage() {
  return (
    <Suspense>
      <SignupForm />
    </Suspense>
  )
}
