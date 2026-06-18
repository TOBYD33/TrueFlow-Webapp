'use client'
// settings/page.tsx
// Profile, business settings, subscription plan, accountant share link

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { Organization, Profile } from '@/types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { toast } from 'sonner'
import { Copy, ExternalLink, RefreshCw } from 'lucide-react'

const PLANS = [
  { id: 'free', label: 'Free', price: '₦0', receipts: '10/month', users: '1' },
  { id: 'solo', label: 'Solo', price: '₦3,000/mo', receipts: 'Unlimited', users: '1' },
  { id: 'business', label: 'Business', price: '₦6,000/mo', receipts: 'Unlimited', users: '5' },
  { id: 'pro', label: 'Business Pro', price: '₦12,000/mo', receipts: 'Unlimited', users: '15' },
]

export default function SettingsPage() {
  const supabase = createClient()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [org, setOrg] = useState<Organization | null>(null)
  const [orgId, setOrgId] = useState<string | null>(null)
  const [shareLink, setShareLink] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [generating, setGenerating] = useState(false)

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const [{ data: p }, { data: member }] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', user.id).single(),
        supabase.from('org_members').select('org_id, organizations(*)').eq('user_id', user.id).single(),
      ])

      setProfile(p as Profile)
      if (member) {
        setOrgId(member.org_id)
        setOrg((member.organizations as unknown as Organization | null))
      }
    }
    load()
  }, [])

  async function saveProfile() {
    if (!profile) return
    setSaving(true)
    const { error } = await supabase.from('profiles').update({ full_name: profile.full_name }).eq('id', profile.id)
    setSaving(false)
    if (error) toast.error(error.message)
    else toast.success('Profile saved')
  }

  async function saveOrg() {
    if (!org || !orgId) return
    setSaving(true)
    const { error } = await supabase.from('organizations').update({ name: org.name, currency: org.currency }).eq('id', orgId)
    setSaving(false)
    if (error) toast.error(error.message)
    else toast.success('Business settings saved')
  }

  async function generateShareLink() {
    if (!orgId) return
    setGenerating(true)
    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + 30)
    const { data, error } = await supabase
      .from('share_links')
      .insert({ org_id: orgId, permission: 'read', expires_at: expiresAt.toISOString() })
      .select()
      .single()
    setGenerating(false)
    if (error || !data) { toast.error('Could not generate link'); return }
    const url = `${window.location.origin}/accountant/${data.token}`
    setShareLink(url)
    toast.success('Share link generated (expires in 30 days)')
  }

  async function copyLink() {
    if (!shareLink) return
    await navigator.clipboard.writeText(shareLink)
    toast.success('Link copied to clipboard')
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <p className="text-sm text-gray-500 mt-0.5">Manage your account and business</p>
      </div>

      {/* Profile */}
      <Card>
        <CardHeader><CardTitle className="text-base">Profile</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-sm font-medium text-gray-700">Full name</label>
            <Input
              className="mt-1"
              value={profile?.full_name ?? ''}
              onChange={e => setProfile(p => p ? { ...p, full_name: e.target.value } : p)}
            />
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700">Phone</label>
            <Input className="mt-1" value={profile?.phone ?? ''} disabled />
          </div>
          <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={saveProfile} disabled={saving}>
            {saving ? 'Saving…' : 'Save Profile'}
          </Button>
        </CardContent>
      </Card>

      {/* Business */}
      <Card>
        <CardHeader><CardTitle className="text-base">Business</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-sm font-medium text-gray-700">Business name</label>
            <Input
              className="mt-1"
              value={org?.name ?? ''}
              onChange={e => setOrg(o => o ? { ...o, name: e.target.value } : o)}
            />
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700">Currency</label>
            <Input
              className="mt-1 w-32"
              value={org?.currency ?? 'NGN'}
              onChange={e => setOrg(o => o ? { ...o, currency: e.target.value } : o)}
            />
          </div>
          <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={saveOrg} disabled={saving}>
            {saving ? 'Saving…' : 'Save Business Settings'}
          </Button>
        </CardContent>
      </Card>

      {/* Subscription */}
      <Card>
        <CardHeader><CardTitle className="text-base">Subscription</CardTitle></CardHeader>
        <CardContent>
          <div className="flex items-center gap-3 mb-5">
            <span className="text-lg font-bold capitalize">{org?.plan ?? 'free'}</span>
            <Badge className="bg-emerald-100 text-emerald-700 border-0">Current plan</Badge>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {PLANS.map(plan => (
              <div
                key={plan.id}
                className={`border rounded-xl p-3 text-center ${org?.plan === plan.id ? 'border-emerald-400 bg-emerald-50' : 'border-gray-200'}`}
              >
                <p className="font-semibold text-sm text-gray-900">{plan.label}</p>
                <p className="text-xs text-emerald-600 font-medium mt-0.5">{plan.price}</p>
                <p className="text-xs text-gray-400 mt-1">{plan.receipts}</p>
                <p className="text-xs text-gray-400">{plan.users} user{plan.users !== '1' ? 's' : ''}</p>
              </div>
            ))}
          </div>
          <p className="text-xs text-gray-400 mt-4">
            To upgrade, visit <a href="https://gettrueflow.com/pricing" target="_blank" rel="noreferrer" className="text-emerald-600 hover:underline">gettrueflow.com/pricing</a>
          </p>
        </CardContent>
      </Card>

      {/* Accountant share link */}
      <Card>
        <CardHeader><CardTitle className="text-base">Accountant Access</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-gray-500">
            Generate a read-only link for your accountant. No login required. Expires in 30 days.
          </p>
          {shareLink && (
            <div className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2 border border-gray-200">
              <span className="text-xs text-gray-600 flex-1 truncate">{shareLink}</span>
              <button onClick={copyLink} className="text-gray-400 hover:text-emerald-600 transition-colors">
                <Copy size={16} />
              </button>
              <a href={shareLink} target="_blank" rel="noreferrer" className="text-gray-400 hover:text-emerald-600 transition-colors">
                <ExternalLink size={16} />
              </a>
            </div>
          )}
          <Button variant="outline" className="gap-2" onClick={generateShareLink} disabled={generating}>
            <RefreshCw size={16} className={generating ? 'animate-spin' : ''} />
            {shareLink ? 'Generate New Link' : 'Generate Link'}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
