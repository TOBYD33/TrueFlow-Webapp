// api/clients/convert-lead/route.ts
// Converts a lead (status='lead') to a real active client. This is the
// moment it starts counting against the plan's client_limit, so it runs
// the SAME check any other new active-client creation runs through —
// never bypassed just because no new row is being created. Blocked exactly
// like a blocked new-client creation, with an upgrade prompt.

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

export async function POST(req: NextRequest) {
  try {
    const { clientId } = await req.json() as { clientId: string }
    if (!clientId) return NextResponse.json({ error: 'Missing clientId' }, { status: 400 })

    const supabase = await createServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

    const admin = getAdmin()

    const { data: member } = await admin
      .from('org_members')
      .select('org_id, role')
      .eq('user_id', user.id)
      .maybeSingle()
    if (!member) return NextResponse.json({ error: 'No organisation found' }, { status: 404 })
    if (!['owner', 'admin'].includes(member.role)) {
      return NextResponse.json({ error: 'Only owners and admins can convert leads' }, { status: 403 })
    }

    const { data: client } = await admin
      .from('clients')
      .select('id, org_id, status')
      .eq('id', clientId)
      .eq('org_id', member.org_id)
      .maybeSingle()
    if (!client) return NextResponse.json({ error: 'Client not found' }, { status: 404 })
    if (client.status !== 'lead') {
      return NextResponse.json({ error: 'This client is not a lead' }, { status: 400 })
    }

    // The shared plan-limit check — same one new active-client creation
    // (guided WhatsApp setup, web "Add Client") is subject to. Leads never
    // count; this update is exactly the moment this row starts counting.
    const { data: org } = await admin
      .from('organizations')
      .select('client_limit')
      .eq('id', member.org_id)
      .single()

    const limit = org?.client_limit ?? 0
    if (limit !== -1) {
      const { count } = await admin
        .from('clients')
        .select('id', { count: 'exact', head: true })
        .eq('org_id', member.org_id)
        .eq('status', 'active')

      if ((count ?? 0) >= limit) {
        return NextResponse.json(
          {
            error: `Your plan allows ${limit} active client${limit === 1 ? '' : 's'} and you're already at that limit. Upgrade to convert this lead.`,
            upgradeRequired: true,
          },
          { status: 403 }
        )
      }
    }

    const { error } = await admin.from('clients').update({ status: 'active' }).eq('id', clientId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('convert-lead error:', err)
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 })
  }
}
