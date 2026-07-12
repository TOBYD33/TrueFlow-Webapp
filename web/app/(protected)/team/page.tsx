'use client'
// team/page.tsx
// Team member management — list, invite, toggle WhatsApp, remove

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { useViewingContext } from '@/components/ViewingContext'
import { OrgMember } from '@/types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { UserPlus, Trash2, Link2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { usePageTools } from '@/components/shared/PageTools'

const ROLE_COLORS: Record<string, string> = {
  owner: 'bg-[#6C63FF]/10 text-[#6C63FF]',
  admin: 'bg-[#00D4AA]/10 text-[#00A88A]',
  staff: 'bg-gray-100 text-gray-700',
  accountant: 'bg-amber-100 text-amber-700',
}

export default function TeamPage() {
  const supabase = createClient()
  const { orgId, userId } = useViewingContext()
  const [members, setMembers] = useState<OrgMember[]>([])
  const [myRole, setMyRole] = useState<string>('staff')
  const [loading, setLoading] = useState(true)
  const [inviteOpen, setInviteOpen] = useState(false)
  const [invitePhone, setInvitePhone] = useState('')
  const [inviteRole, setInviteRole] = useState<'admin' | 'staff' | 'accountant'>('staff')
  const [inviting, setInviting] = useState(false)

  useEffect(() => {
    if (!orgId || !userId) return
    async function load() {
      const [{ data: me }, { data }] = await Promise.all([
        supabase.from('org_members').select('role').eq('org_id', orgId).eq('user_id', userId).single(),
        supabase.from('org_members')
          .select('*, profiles(full_name, phone, avatar_url)')
          .eq('org_id', orgId)
          .order('joined_at', { ascending: true }),
      ])
      if (me) setMyRole(me.role)
      setMembers((data as OrgMember[]) ?? [])
      setLoading(false)
    }
    load()
  }, [orgId, userId])

  async function handleInvite() {
    if (!orgId || !invitePhone.trim()) return
    setInviting(true)
    const { error } = await supabase.from('org_members').insert({
      org_id: orgId,
      role: inviteRole,
      whatsapp_number: invitePhone.trim(),
      whatsapp_active: true,
    })
    setInviting(false)
    if (error) { toast.error(error.message); return }
    toast.success('Member added — they can now scan via WhatsApp')
    setInviteOpen(false)
    setInvitePhone('')
    const { data } = await supabase.from('org_members').select('*, profiles(full_name, phone, avatar_url)').eq('org_id', orgId)
    setMembers((data as OrgMember[]) ?? [])
  }

  async function toggleWhatsApp(member: OrgMember) {
    await supabase.from('org_members').update({ whatsapp_active: !member.whatsapp_active }).eq('id', member.id)
    setMembers(prev => prev.map(m => m.id === member.id ? { ...m, whatsapp_active: !m.whatsapp_active } : m))
  }

  async function removeMember(member: OrgMember) {
    if (!confirm(`Remove ${member.profiles?.full_name ?? member.whatsapp_number ?? 'this member'}?`)) return
    await supabase.from('org_members').delete().eq('id', member.id)
    setMembers(prev => prev.filter(m => m.id !== member.id))
    toast.success('Member removed')
  }

  const canManage = myRole === 'owner' || myRole === 'admin'

  const { query: headerQuery } = usePageTools({
    searchable: true,
    exportName: 'team',
    exportRows: () =>
      visibleMembers.map(m => ({
        name: m.profiles?.full_name ?? '',
        phone: m.whatsapp_number ?? m.profiles?.phone ?? '',
        role: m.role,
        whatsapp_active: m.whatsapp_active ? 'yes' : 'no',
      })),
  })

  const visibleMembers = headerQuery
    ? members.filter(m => {
        const q = headerQuery.toLowerCase()
        return (
          (m.profiles?.full_name ?? '').toLowerCase().includes(q) ||
          (m.whatsapp_number ?? '').includes(headerQuery) ||
          m.role.toLowerCase().includes(q)
        )
      })
    : members

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Team</h1>
          <p className="text-sm text-gray-500 mt-0.5">{members.length} members</p>
        </div>
        {canManage && (
          <div className="flex gap-2">
            <Button
              variant="outline"
              className="gap-2"
              onClick={() => {
                const url = `${window.location.origin}/signup?org=${orgId}&role=staff`
                navigator.clipboard.writeText(url)
                toast.success('Invite link copied — share it with your team member')
              }}
            >
              <Link2 size={16} /> Copy Invite Link
            </Button>
            <Button className="bg-[#6C63FF] hover:bg-[#5A52E0] gap-2" onClick={() => setInviteOpen(true)}>
              <UserPlus size={16} /> Add WhatsApp Staff
            </Button>
          </div>
        )}
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-8 text-center text-sm text-gray-400">Loading…</div>
          ) : (
            <div className="divide-y divide-gray-100">
              {visibleMembers.map(member => {
                const name = member.profiles?.full_name ?? member.whatsapp_number ?? 'Unknown'
                const initials = name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
                return (
                  <div key={member.id} className="flex items-center gap-3 px-4 py-4 flex-wrap sm:flex-nowrap">
                    <Avatar className="h-9 w-9 shrink-0">
                      <AvatarFallback className="bg-[#6C63FF]/10 text-[#6C63FF] text-sm font-semibold">{initials}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-900 truncate">{name}</p>
                      <p className="text-xs text-gray-400">{member.whatsapp_number ?? member.profiles?.phone ?? '—'}</p>
                    </div>
                    <Badge variant="outline" className={cn('shrink-0', ROLE_COLORS[member.role] ?? '')}>{member.role}</Badge>
                    <div className="flex items-center gap-3 shrink-0">
                      <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={member.whatsapp_active}
                          onChange={() => canManage && toggleWhatsApp(member)}
                          disabled={!canManage}
                          className="accent-[#6C63FF]"
                        />
                        <span className="hidden sm:inline">WhatsApp</span>
                      </label>
                      {canManage && member.role !== 'owner' && (
                        <button onClick={() => removeMember(member)} className="text-gray-300 hover:text-red-500 transition-colors">
                          <Trash2 size={16} />
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Add Team Member</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-gray-700">WhatsApp number</label>
              <Input
                placeholder="+2348012345678"
                value={invitePhone}
                onChange={e => setInvitePhone(e.target.value)}
                className="mt-1"
              />
              <p className="text-xs text-gray-400 mt-1">They will be able to scan receipts via WhatsApp immediately</p>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700">Role</label>
              <Select value={inviteRole} onValueChange={v => setInviteRole(v as typeof inviteRole)}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Admin — can manage team + settings</SelectItem>
                  <SelectItem value="staff">Staff — can scan receipts only</SelectItem>
                  <SelectItem value="accountant">Accountant — read-only access</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-3 pt-2">
              <Button variant="outline" className="flex-1" onClick={() => setInviteOpen(false)}>Cancel</Button>
              <Button className="flex-1 bg-[#6C63FF] hover:bg-[#5A52E0]" onClick={handleInvite} disabled={inviting}>
                {inviting ? 'Adding…' : 'Add Member'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
