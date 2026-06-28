// api/share-link/route.ts
// Creates and revokes accountant share links.
// Uses admin client to bypass RLS on share_links table.

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

// GET /api/share-link — list all share links for the user's org
export async function GET(_req: NextRequest) {
  try {
    const supabase = await createServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

    const admin = getAdmin()

    const { data: member } = await admin
      .from('org_members')
      .select('org_id')
      .eq('user_id', user.id)
      .single()

    if (!member) return NextResponse.json({ links: [] })

    const { data } = await admin
      .from('share_links')
      .select('*')
      .eq('org_id', member.org_id)
      .order('created_at', { ascending: false })

    return NextResponse.json({ links: data ?? [] })
  } catch (err) {
    console.error('share-link GET error:', err)
    return NextResponse.json({ links: [] })
  }
}

// POST /api/share-link — create a new share link
export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

    const { permission = 'read' } = await req.json().catch(() => ({}))

    const admin = getAdmin()

    const { data: member } = await admin
      .from('org_members')
      .select('org_id')
      .eq('user_id', user.id)
      .single()

    if (!member) return NextResponse.json({ error: 'No organisation found' }, { status: 404 })

    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + 30)

    const { data, error } = await admin
      .from('share_links')
      .insert({
        org_id: member.org_id,
        permission,
        expires_at: expiresAt.toISOString(),
      })
      .select()
      .single()

    if (error) {
      console.error('share-link POST failed:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, link: data })
  } catch (err) {
    console.error('share-link POST error:', err)
    return NextResponse.json({ error: 'Failed to generate link' }, { status: 500 })
  }
}

// DELETE /api/share-link?id=xxx — revoke a share link
export async function DELETE(req: NextRequest) {
  try {
    const supabase = await createServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

    const id = req.nextUrl.searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

    const admin = getAdmin()

    // Verify the link belongs to the user's org before deleting
    const { data: member } = await admin
      .from('org_members')
      .select('org_id')
      .eq('user_id', user.id)
      .single()

    if (!member) return NextResponse.json({ error: 'No organisation found' }, { status: 404 })

    const { error } = await admin
      .from('share_links')
      .delete()
      .eq('id', id)
      .eq('org_id', member.org_id)

    if (error) {
      console.error('share-link DELETE failed:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('share-link DELETE error:', err)
    return NextResponse.json({ error: 'Failed to revoke link' }, { status: 500 })
  }
}
