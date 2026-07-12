// api/search/route.ts
// Global cross-app search: clients, invoices, receipts, projects, team.
// Auth: requires a logged-in session; results scoped to the caller's org.
// Permissions: staff without client visibility get no client/project
// results; income visibility gates invoices. 5 results shown per group.

import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase-server'
import { createClient } from '@supabase/supabase-js'

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

const PER_GROUP = 5

export interface SearchItem {
  id: string
  label: string
  sub: string
  href: string
}

export interface SearchGroup {
  type: string
  items: SearchItem[]
  hasMore: boolean
  viewAllHref: string
}

export async function GET(req: NextRequest) {
  try {
    const q = (req.nextUrl.searchParams.get('q') ?? '').trim()
    if (q.length < 2) return NextResponse.json({ groups: [] })

    const supabase = await createServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

    const admin = getAdmin()
    const { data: memberships } = await admin
      .from('org_members')
      .select('*')
      .eq('user_id', user.id)

    if (!memberships || memberships.length === 0) return NextResponse.json({ groups: [] })
    const member = memberships.find((m: any) => m.role === 'owner') ?? memberships[0]
    const orgId = member.org_id

    // Permission gates per the two-layer permission spec. Columns may not
    // exist on older rows, so default from role.
    const isOwnerOrAdmin = ['owner', 'admin'].includes(member.role)
    const canSeeClients = isOwnerOrAdmin || member.can_see_clients === true
    const canSeeIncome = isOwnerOrAdmin || member.can_see_income === true

    const like = `%${q.replace(/[%_]/g, '')}%`
    const fetchN = PER_GROUP + 1 // one extra to detect "more"

    const [clientsRes, invoicesRes, receiptsRes, projectsRes, teamRes] = await Promise.all([
      canSeeClients
        ? admin.from('clients').select('id, name, phone, status').eq('org_id', orgId).ilike('name', like).limit(fetchN)
        : Promise.resolve({ data: [] as any[] }),
      canSeeIncome
        ? admin.from('invoices').select('id, invoice_number, client_name, total_amount, currency, status, clients(name)').eq('org_id', orgId).or(`invoice_number.ilike.${like},client_name.ilike.${like}`).limit(fetchN)
        : Promise.resolve({ data: [] as any[] }),
      admin.from('receipts').select('id, vendor_name, category, amount, currency, date').eq('org_id', orgId).or(`vendor_name.ilike.${like},category.ilike.${like}`).limit(fetchN),
      canSeeClients
        ? admin.from('projects').select('id, name, status, clients(name)').eq('org_id', orgId).ilike('name', like).limit(fetchN)
        : Promise.resolve({ data: [] as any[] }),
      admin.from('org_members').select('id, role, whatsapp_number, profiles(full_name)').eq('org_id', orgId).limit(50),
    ])

    const groups: SearchGroup[] = []

    const clients = (clientsRes.data ?? []) as any[]
    if (clients.length > 0) {
      groups.push({
        type: 'Clients',
        hasMore: clients.length > PER_GROUP,
        viewAllHref: '/clients',
        items: clients.slice(0, PER_GROUP).map(c => ({
          id: c.id,
          label: c.name,
          sub: c.phone ?? c.status,
          href: `/clients/${c.id}`,
        })),
      })
    }

    const invoices = (invoicesRes.data ?? []) as any[]
    if (invoices.length > 0) {
      groups.push({
        type: 'Invoices',
        hasMore: invoices.length > PER_GROUP,
        viewAllHref: '/invoices',
        items: invoices.slice(0, PER_GROUP).map(inv => {
          const clientName = (Array.isArray(inv.clients) ? inv.clients[0]?.name : inv.clients?.name) ?? inv.client_name ?? ''
          return {
            id: inv.id,
            label: inv.invoice_number ?? 'Invoice',
            sub: `${clientName} · ${inv.status}`,
            href: `/invoices/${inv.id}`,
          }
        }),
      })
    }

    const receipts = (receiptsRes.data ?? []) as any[]
    if (receipts.length > 0) {
      groups.push({
        type: 'Receipts',
        hasMore: receipts.length > PER_GROUP,
        viewAllHref: '/receipts',
        items: receipts.slice(0, PER_GROUP).map(r => ({
          id: r.id,
          label: r.vendor_name ?? 'Receipt',
          sub: `${r.category} · ${r.date}`,
          href: `/receipts/${r.id}`,
        })),
      })
    }

    const projects = (projectsRes.data ?? []) as any[]
    if (projects.length > 0) {
      groups.push({
        type: 'Projects',
        hasMore: projects.length > PER_GROUP,
        viewAllHref: '/projects',
        items: projects.slice(0, PER_GROUP).map(p => {
          const clientName = (Array.isArray(p.clients) ? p.clients[0]?.name : p.clients?.name) ?? ''
          return {
            id: p.id,
            label: p.name,
            sub: `${clientName}${clientName ? ' · ' : ''}${String(p.status).replace('_', ' ')}`,
            href: `/projects/${p.id}`,
          }
        }),
      })
    }

    // Team: profiles join can't ilike server-side reliably across FK name
    // variants, so filter the (small) member list here.
    const team = ((teamRes.data ?? []) as any[])
      .map(m => {
        const profile = Array.isArray(m.profiles) ? m.profiles[0] : m.profiles
        return { id: m.id, name: profile?.full_name ?? m.whatsapp_number ?? '', role: m.role }
      })
      .filter(m => m.name.toLowerCase().includes(q.toLowerCase()))
    if (team.length > 0) {
      groups.push({
        type: 'Team',
        hasMore: team.length > PER_GROUP,
        viewAllHref: '/team',
        items: team.slice(0, PER_GROUP).map(m => ({
          id: m.id,
          label: m.name,
          sub: m.role,
          href: '/team',
        })),
      })
    }

    return NextResponse.json({ groups })
  } catch (err) {
    console.error('api/search error:', err)
    return NextResponse.json({ error: 'Search failed' }, { status: 500 })
  }
}
