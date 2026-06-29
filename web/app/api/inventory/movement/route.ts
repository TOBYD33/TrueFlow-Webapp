// api/inventory/movement/route.ts
// Records a stock movement (restock, sale, adjustment) via the update_inventory_stock RPC.
// The RPC is atomic and prevents stock from going below zero.

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

// POST /api/inventory/movement — record a stock movement
export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

    const body = await req.json().catch(() => ({}))
    const { itemId, quantityChange, changeType, referenceType, referenceId, notes } = body

    if (!itemId || quantityChange === undefined || !changeType) {
      return NextResponse.json({ error: 'itemId, quantityChange and changeType are required' }, { status: 400 })
    }

    if (!['restock', 'sale', 'adjustment'].includes(changeType)) {
      return NextResponse.json({ error: 'changeType must be restock, sale or adjustment' }, { status: 400 })
    }

    const admin = getAdmin()

    // Verify the item belongs to the user's org
    const { data: member } = await admin
      .from('org_members')
      .select('org_id')
      .eq('user_id', user.id)
      .single()

    if (!member) return NextResponse.json({ error: 'No organisation found' }, { status: 404 })

    const { data: item } = await admin
      .from('inventory_items')
      .select('org_id')
      .eq('id', itemId)
      .single()

    if (!item || item.org_id !== member.org_id) {
      return NextResponse.json({ error: 'Item not found' }, { status: 404 })
    }

    // Call the atomic RPC — this prevents stock going below zero
    const { error } = await admin.rpc('update_inventory_stock', {
      p_item_id: itemId,
      p_quantity_change: quantityChange,
      p_change_type: changeType,
      p_reference_type: referenceType ?? null,
      p_reference_id: referenceId ?? null,
      p_notes: notes ?? null,
      p_created_by: user.id,
    })

    if (error) {
      console.error('inventory movement failed:', error)
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('inventory/movement POST error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
