'use client'
// settings/profile/page.tsx
// Update full name, phone, avatar, and send password reset email

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { Profile } from '@/types'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'
import { Camera, Loader2 } from 'lucide-react'

export default function ProfileSettingsPage() {
  const supabase = createClient()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [email, setEmail] = useState('')
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [sendingReset, setSendingReset] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      setEmail(user.email ?? '')
      const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single()
      if (data) setProfile(data as Profile)
    }
    load()
  }, [])

  async function handleAvatarUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !profile) return
    setUploading(true)
    const ext = file.name.split('.').pop() ?? 'jpg'
    const path = `avatars/${profile.id}/avatar.${ext}`
    const { error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(path, file, { upsert: true, contentType: file.type })
    if (uploadError) {
      toast.error('Avatar upload failed: ' + uploadError.message)
      setUploading(false)
      return
    }
    const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path)
    const { error } = await supabase.from('profiles').update({ avatar_url: publicUrl }).eq('id', profile.id)
    setUploading(false)
    if (error) { toast.error(error.message); return }
    setProfile(p => p ? { ...p, avatar_url: publicUrl } : p)
    toast.success('Avatar updated')
  }

  async function saveProfile() {
    if (!profile) return
    setSaving(true)
    const { error } = await supabase.from('profiles').update({
      full_name: profile.full_name,
      phone: profile.phone,
    }).eq('id', profile.id)
    setSaving(false)
    if (error) toast.error(error.message)
    else toast.success('Profile saved')
  }

  async function sendPasswordReset() {
    if (!email) return
    setSendingReset(true)
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/update-password`,
    })
    setSendingReset(false)
    if (error) toast.error(error.message)
    else toast.success('Password reset email sent — check your inbox')
  }

  return (
    <div className="space-y-5">
      {/* Avatar */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
            <div className="relative shrink-0">
              <div className="w-20 h-20 rounded-full bg-emerald-100 flex items-center justify-center overflow-hidden border-2 border-gray-200">
                {profile?.avatar_url
                  ? <img src={profile.avatar_url} alt="Avatar" className="w-full h-full object-cover" />
                  : <span className="text-2xl font-bold text-emerald-600">{profile?.full_name?.[0]?.toUpperCase() ?? '?'}</span>
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
              <p className="font-semibold text-gray-900">{profile?.full_name ?? 'Your name'}</p>
              <p className="text-sm text-gray-500">{email}</p>
              <p className="text-xs text-gray-400 mt-1">Click the camera icon to change your photo</p>
            </div>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} />
          </div>
        </CardContent>
      </Card>

      {/* Name + Phone + Email */}
      <Card>
        <CardContent className="pt-6 space-y-4">
          <div>
            <label className="text-sm font-medium text-gray-700">Full name</label>
            <Input
              className="mt-1"
              placeholder="Your full name"
              value={profile?.full_name ?? ''}
              onChange={e => setProfile(p => p ? { ...p, full_name: e.target.value } : p)}
            />
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700">Phone number</label>
            <Input
              className="mt-1"
              placeholder="+234 800 000 0000"
              value={profile?.phone ?? ''}
              onChange={e => setProfile(p => p ? { ...p, phone: e.target.value } : p)}
            />
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700">Email address</label>
            <Input className="mt-1 bg-gray-50" value={email} disabled />
            <p className="text-xs text-gray-400 mt-1">Email cannot be changed here. Contact support if needed.</p>
          </div>
          <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={saveProfile} disabled={saving}>
            {saving ? 'Saving…' : 'Save Profile'}
          </Button>
        </CardContent>
      </Card>

      {/* Password */}
      <Card>
        <CardContent className="pt-6">
          <h3 className="font-medium text-gray-900 mb-1">Change password</h3>
          <p className="text-sm text-gray-500 mb-4">We&apos;ll send a password reset link to <strong>{email}</strong></p>
          <Button variant="outline" onClick={sendPasswordReset} disabled={sendingReset}>
            {sendingReset ? 'Sending…' : 'Send Password Reset Email'}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
