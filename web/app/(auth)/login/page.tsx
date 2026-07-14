'use client'
// login/page.tsx
// Login page with WhatsApp Sign In (OTP via WhatsApp) above the regular email/password form.

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase-browser'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

// ── Onboarding magic link (app.gettrueflow.com/login?token=xyz) ─────────────
// Consumes the token from send-post-onboarding-follow-ups, exchanges it for
// a session in-browser (same pattern as OTP login — no redirect through
// Supabase's Site URL), then sends the user straight to the dashboard.

function MagicLinkHandler() {
  const supabase = createClient()
  const [state, setState] = useState<'idle' | 'working' | 'error'>('idle')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get('token')
    if (!token) return

    setState('working')
    window.history.replaceState({}, '', '/login')

    fetch('/api/auth/whatsapp/magic-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    })
      .then(async res => {
        const json = await res.json()
        if (!res.ok) throw new Error(json.error || 'This link is invalid.')
        const { error: sessionError } = await supabase.auth.verifyOtp({ type: 'email', token_hash: json.token_hash })
        if (sessionError) throw sessionError
        window.location.href = '/dashboard'
      })
      .catch(err => {
        setState('error')
        setError(err.message || 'Could not sign you in with that link.')
      })
  }, [])

  if (state === 'idle') return null

  return (
    <Card className="border-[#6C63FF]/30 bg-[#6C63FF]/5">
      <CardContent className="pt-6 text-sm">
        {state === 'working' ? (
          <p className="text-gray-600">Signing you in…</p>
        ) : (
          <p className="text-red-600">{error} Use WhatsApp Sign In or your email below.</p>
        )}
      </CardContent>
    </Card>
  )
}

// ── WhatsApp Sign In ─────────────────────────────────────────────────────────

function WhatsAppSignIn() {
  const supabase = createClient()
  const [step, setStep] = useState<'phone' | 'otp' | 'loading'>('phone')
  const [phone, setPhone] = useState('')
  const [normalisedPhone, setNormalisedPhone] = useState('')
  const [otp, setOtp] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [verifying, setVerifying] = useState(false)

  async function sendCode(e: React.FormEvent) {
    e.preventDefault()
    setSending(true)
    setError(null)

    const res = await fetch('/api/auth/whatsapp/send-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone }),
    })
    const json = await res.json()

    setSending(false)

    if (!res.ok || json.error) {
      setError(json.error || 'Failed to send code.')
      return
    }

    setNormalisedPhone(json.phone)
    setStep('otp')
  }

  async function verifyCode(e: React.FormEvent) {
    e.preventDefault()
    setVerifying(true)
    setError(null)

    const res = await fetch('/api/auth/whatsapp/verify-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: normalisedPhone, code: otp }),
    })
    const json = await res.json()

    if (!res.ok || json.error) {
      setVerifying(false)
      setError(json.error || 'Verification failed.')
      return
    }

    // Success means the number is linked — the API rejects unknown numbers
    // with a clear error. Exchange the one-time token hash for a session
    // right here in the browser (no redirect through Supabase's Site URL).
    setStep('loading')
    const { error: sessionError } = await supabase.auth.verifyOtp({
      type: 'email',
      token_hash: json.token_hash,
    })
    if (sessionError) {
      setStep('otp')
      setVerifying(false)
      setError('Could not complete sign-in. Please request a new code and try again.')
      return
    }
    // Full navigation so the server layout picks up the new session cookies
    window.location.href = '/dashboard'
  }

  return (
    <Card className="border-[#25D366]/30 bg-[#25D366]/5">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          {/* WhatsApp icon */}
          <svg viewBox="0 0 24 24" className="w-5 h-5 fill-[#25D366]">
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
          </svg>
          <CardTitle className="text-base text-gray-900">WhatsApp Sign In</CardTitle>
        </div>
        <CardDescription className="text-xs mt-1">
          Already using TrueFlow on WhatsApp? Sign in with your WhatsApp number.
        </CardDescription>
      </CardHeader>

      <CardContent>
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
              disabled={sending}
              className="w-full h-10 rounded-lg bg-[#25D366] hover:bg-[#1ebe5d] text-white text-sm font-semibold transition-colors disabled:opacity-60"
            >
              {sending ? 'Sending…' : 'Send Code via WhatsApp'}
            </button>
          </form>
        )}

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
                pattern="[0-9]{6}"
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
              disabled={verifying || otp.length !== 6}
              className="w-full h-10 rounded-lg bg-[#25D366] hover:bg-[#1ebe5d] text-white text-sm font-semibold transition-colors disabled:opacity-60"
            >
              {verifying ? 'Verifying…' : 'Verify & Sign In'}
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

        {step === 'loading' && (
          <div className="text-center py-4">
            <div className="w-6 h-6 border-2 border-[#25D366] border-t-transparent rounded-full animate-spin mx-auto mb-2" />
            <p className="text-sm text-gray-500">Signing you in…</p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ── Email / Password Sign In ─────────────────────────────────────────────────

export default function LoginPage() {
  const router = useRouter()
  const supabase = createClient()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const { error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }

    router.push('/dashboard')
    router.refresh()
  }

  return (
    <div className="space-y-4">
      {/* Onboarding magic-link handler — silent unless ?token= is present */}
      <MagicLinkHandler />

      {/* WhatsApp Sign In — shown first */}
      <WhatsAppSignIn />

      {/* Divider */}
      <div className="flex items-center gap-3">
        <div className="flex-1 h-px bg-gray-200" />
        <span className="text-xs text-gray-400 whitespace-nowrap">or sign in with email</span>
        <div className="flex-1 h-px bg-gray-200" />
      </div>

      {/* Regular Sign In */}
      <Card>
        <CardHeader>
          <CardTitle>Sign in</CardTitle>
          <CardDescription>Access your TrueFlow dashboard</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">Email</label>
              <Input
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">Password</label>
              <Input
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
              />
            </div>
            {error && <p className="text-sm text-red-500">{error}</p>}
            <Button type="submit" className="w-full bg-emerald-600 hover:bg-emerald-700" disabled={loading}>
              {loading ? 'Signing in…' : 'Sign in'}
            </Button>
            <div className="text-center">
              <Link href="/reset-password" className="text-sm text-gray-400 hover:text-emerald-600">
                Forgot password?
              </Link>
            </div>
          </form>
          <p className="text-center text-sm text-gray-500 mt-4">
            No account?{' '}
            <Link href="/signup" className="text-emerald-600 hover:underline font-medium">
              Create one free
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
