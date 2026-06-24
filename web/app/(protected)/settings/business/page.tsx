'use client'
// settings/business/page.tsx
// Update business name, type, currency, and logo

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { Organization } from '@/types'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from 'sonner'
import { Building2, Camera, Loader2 } from 'lucide-react'

const BUSINESS_TYPES = [
  { value: 'sme', label: 'Small / Medium Business (SME)' },
  { value: 'freelancer', label: 'Freelancer' },
  { value: 'agency', label: 'Agency' },
  { value: 'individual', label: 'Individual' },
  { value: 'family', label: 'Family' },
]

const CURRENCIES = [
  { value: 'NGN', label: '₦ Nigerian Naira (NGN)' },
  { value: 'USD', label: '$ US Dollar (USD)' },
  { value: 'GBP', label: '£ British Pound (GBP)' },
  { value: 'EUR', label: '€ Euro (EUR)' },
  { value: 'KES', label: 'KSh Kenyan Shilling (KES)' },
  { value: 'GHS', label: '₵ Ghanaian Cedi (GHS)' },
  { value: 'ZAR', label: 'R South African Rand (ZAR)' },
]

type OrgWithLogo = Organization & { logo_url?: string | null }

export default function BusinessSettingsPage() {
  const supabase = createClient()
  const [org, setOrg] = useState<OrgWithLogo | null>(null)
  const [orgId, setOrgId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: member } = await supabase
        .from('org_members').select('org_id').eq('user_id', user.id).single()
      if (!member) return
      setOrgId(member.org_id)
      const { data } = await supabase
        .from('organizations').select('*').eq('id', member.org_id).single()
      if (data) setOrg(data as OrgWithLogo)
    }
    load()
  }, [])

  async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !orgId) return
    setUploading(true)
    const ext = file.name.split('.').pop() ?? 'png'
    const path = `logos/${orgId}/logo.${ext}`
    const { error: uploadError } = await supabase.storage
      .from('logos')
      .upload(path, file, { upsert: true, contentType: file.type })
    if (uploadError) {
      toast.error('Logo upload failed: ' + uploadError.message)
      setUploading(false)
      return
    }
    const { data: { publicUrl } } = supabase.storage.from('logos').getPublicUrl(path)
    const { error } = await supabase.from('organizations').update({ logo_url: publicUrl }).eq('id', orgId)
    setUploading(false)
    if (error) { toast.error(error.message); return }
    setOrg(o => o ? { ...o, logo_url: publicUrl } : o)
    toast.success('Logo updated')
  }

  async function saveOrg() {
    if (!org || !orgId) return
    setSaving(true)
    const { error } = await supabase.from('organizations').update({
      name: org.name,
      type: org.type,
      currency: org.currency,
    }).eq('id', orgId)
    setSaving(false)
    if (error) toast.error(error.message)
    else toast.success('Business settings saved')
  }

  return (
    <div className="space-y-5">
      {/* Logo */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-5">
            <div className="relative">
              <div className="w-20 h-20 rounded-xl bg-gray-100 flex items-center justify-center overflow-hidden border-2 border-gray-200">
                {org?.logo_url
                  ? <img src={org.logo_url} alt="Business logo" className="w-full h-full object-cover" />
                  : <Building2 size={32} className="text-gray-400" />
                }
              </div>
              <button
                onClick={() => fileRef.current?.click()}
                className="absolute bottom-0 right-0 w-7 h-7 rounded-full bg-emerald-600 text-white flex items-center justify-center shadow-md hover:bg-emerald-700 transition-colors"
              >
                {uploading ? <Loader2 size={12} className="animate-spin" /> : <Camera size={12} />}
              </button>
            </div>
            <div>
              <p className="font-semibold text-gray-900">{org?.name ?? 'Your Business'}</p>
              <p className="text-sm text-gray-500">Business logo · shown on invoices and reports</p>
              <p className="text-xs text-gray-400 mt-1">PNG or JPG · Recommended 400×400px</p>
            </div>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />
          </div>
        </CardContent>
      </Card>

      {/* Business details */}
      <Card>
        <CardContent className="pt-6 space-y-4">
          <div>
            <label className="text-sm font-medium text-gray-700">Business name</label>
            <Input
              className="mt-1"
              placeholder="Your Business Name"
              value={org?.name ?? ''}
              onChange={e => setOrg(o => o ? { ...o, name: e.target.value } : o)}
            />
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700">Business type</label>
            <Select
              value={org?.type ?? 'sme'}
              onValueChange={v => { if (v) setOrg(o => o ? ({ ...o, type: v } as OrgWithLogo) : o) }}
            >
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {BUSINESS_TYPES.map(t => (
                  <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700">Default currency</label>
            <Select
              value={org?.currency ?? 'NGN'}
              onValueChange={v => { if (v) setOrg(o => o ? { ...o, currency: v } : o) }}
            >
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CURRENCIES.map(c => (
                  <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={saveOrg} disabled={saving}>
            {saving ? 'Saving…' : 'Save Business Settings'}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
