'use client'
// signup/page.tsx
// Account creation — creates auth user + profile + org.
// If ?org=ORG_ID is in URL, joins that org as staff instead of creating a new one.

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase-browser'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Suspense } from 'react'

function SignupForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = createClient()

  const inviteOrgId = searchParams.get('org')
  const inviteRole = (searchParams.get('role') as 'staff' | 'admin' | 'accountant') || 'staff'
  const [inviteOrgName, setInviteOrgName] = useState<string | null>(null)

  const [fullName, setFullName] = useState('')
  const [businessName, setBusinessName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // If invited, look up the org name to show in UI
  useEffect(() => {
    if (!inviteOrgId) return
    supabase.from('organizations').select('name').eq('id', inviteOrgId).single()
      .then(({ data }) => setInviteOrgName(data?.name ?? null))
  }, [inviteOrgId])

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const { data, error: signupError } = await supabase.auth.signUp({ email, password })

    if (signupError || !data.user) {
      setError(signupError?.message ?? 'Signup failed')
      setLoading(false)
      return
    }

    const userId = data.user.id

    const { error: profileError } = await supabase
      .from('profiles')
      .insert({ id: userId, full_name: fullName })

    if (profileError) {
      setError(profileError.message)
      setLoading(false)
      return
    }

    if (inviteOrgId) {
      // Join the invited org instead of creating a new one
      const { error: memberError } = await supabase.from('org_members').insert({
        org_id: inviteOrgId,
        user_id: userId,
        role: inviteRole,
        joined_at: new Date().toISOString(),
      })
      if (memberError) {
        setError(memberError.message)
        setLoading(false)
        return
      }
    } else {
      // Create a new org and become owner
      const { data: org, error: orgError } = await supabase
        .from('organizations')
        .insert({ name: businessName || `${fullName}'s Business`, owner_id: userId })
        .select()
        .single()

      if (orgError || !org) {
        setError(orgError?.message ?? 'Could not create organisation')
        setLoading(false)
        return
      }

      await supabase.from('org_members').insert({
        org_id: org.id,
        user_id: userId,
        role: 'owner',
      })
    }

    router.push('/dashboard')
    router.refresh()
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {inviteOrgName ? `Join ${inviteOrgName}` : 'Create your account'}
        </CardTitle>
        <CardDescription>
          {inviteOrgName
            ? `You've been invited to join ${inviteOrgName} on TrueFlio`
            : 'Free forever — no credit card needed'}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSignup} className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">Your name</label>
            <Input
              placeholder="Tobi Adeleke"
              value={fullName}
              onChange={e => setFullName(e.target.value)}
              required
            />
          </div>
          {!inviteOrgId && (
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">Business name</label>
              <Input
                placeholder="Adeleke Boutique"
                value={businessName}
                onChange={e => setBusinessName(e.target.value)}
              />
            </div>
          )}
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
              placeholder="Min 6 characters"
              value={password}
              onChange={e => setPassword(e.target.value)}
              minLength={6}
              required
            />
          </div>
          {error && <p className="text-sm text-red-500">{error}</p>}
          <Button type="submit" className="w-full bg-emerald-600 hover:bg-emerald-700" disabled={loading}>
            {loading ? 'Creating account…' : inviteOrgName ? `Join ${inviteOrgName}` : 'Create free account'}
          </Button>
        </form>
        <p className="text-center text-sm text-gray-500 mt-4">
          Already have an account?{' '}
          <Link href="/login" className="text-emerald-600 hover:underline font-medium">
            Sign in
          </Link>
        </p>
      </CardContent>
    </Card>
  )
}

export default function SignupPage() {
  return (
    <Suspense>
      <SignupForm />
    </Suspense>
  )
}
