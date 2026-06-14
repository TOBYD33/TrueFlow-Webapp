'use client'
// signup/page.tsx
// Account creation — creates auth user + profile + org

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase-browser'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export default function SignupPage() {
  const router = useRouter()
  const supabase = createClient()

  const [fullName, setFullName] = useState('')
  const [businessName, setBusinessName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

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

    // Create profile
    const { error: profileError } = await supabase
      .from('profiles')
      .insert({ id: userId, full_name: fullName })

    if (profileError) {
      setError(profileError.message)
      setLoading(false)
      return
    }

    // Create org
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

    // Add as owner member
    await supabase.from('org_members').insert({
      org_id: org.id,
      user_id: userId,
      role: 'owner',
    })

    router.push('/dashboard')
    router.refresh()
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Create your account</CardTitle>
        <CardDescription>Free forever — no credit card needed</CardDescription>
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
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">Business name</label>
            <Input
              placeholder="Adeleke Boutique"
              value={businessName}
              onChange={e => setBusinessName(e.target.value)}
            />
          </div>
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
            {loading ? 'Creating account…' : 'Create free account'}
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
