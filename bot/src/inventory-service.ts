// inventory-service.ts
// Creates and manages inventory items and stock movements.
// Called by action-executor when the AI detects inventory intent.
// Always requires explicit owner confirmation before any stock change.

import { supabase } from './supabase'
import { setReminder } from './reminder-service'

export async function getInventoryItems(orgId: string) {
  const { data, error } = await supabase
    .from('inventory_items')
    .select('*')
    .eq('org_id', orgId)
    .eq('status', 'active')
    .order('name', { ascending: true })
  if (error) throw new Error(error.message)
  return data || []
}

export async function getLowStockItems(orgId: string) {
  const { data, error } = await supabase
    .from('inventory_items')
    .select('*')
    .eq('org_id', orgId)
    .eq('status', 'active')
  if (error) throw new Error(error.message)
  // Filter in JS since Supabase can't compare two columns in a simple filter
  return (data || []).filter(
    (i: any) => i.quantity_on_hand <= i.low_stock_threshold
  )
}

export async function addInventoryItem(params: {
  orgId: string
  name: string
  quantity: number
  unitCost?: number
  unitPrice?: number
  sku?: string
  category?: string
}) {
  const { data, error } = await supabase
    .from('inventory_items')
    .insert({
      org_id: params.orgId,
      name: params.name,
      quantity_on_hand: params.quantity,
      unit_cost: params.unitCost || null,
      unit_price: params.unitPrice || null,
      sku: params.sku || null,
      category: params.category || null
    })
    .select()
    .single()
  if (error) throw new Error(error.message)
  return data
}

export async function updateStock(params: {
  orgId: string
  itemId: string
  quantityChange: number
  changeType: 'restock' | 'sale' | 'adjustment'
  referenceType?: string
  referenceId?: string
  notes?: string
  createdBy?: string
}) {
  const { error } = await supabase.rpc('update_inventory_stock', {
    p_item_id: params.itemId,
    p_quantity_change: params.quantityChange,
    p_change_type: params.changeType,
    p_reference_type: params.referenceType || null,
    p_reference_id: params.referenceId || null,
    p_notes: params.notes || null,
    p_created_by: params.createdBy || null
  })
  if (error) throw new Error(error.message)

  if (params.changeType === 'sale') {
    await checkAndAlertLowStock(params.orgId, params.itemId)
  }
}

async function checkAndAlertLowStock(orgId: string, itemId: string) {
  const { data: item } = await supabase
    .from('inventory_items')
    .select('name, quantity_on_hand, low_stock_threshold')
    .eq('id', itemId)
    .single()

  if (!item) return
  if (item.quantity_on_hand <= item.low_stock_threshold) {
    await setReminder({
      orgId,
      title: `Restock ${item.name} — only ${item.quantity_on_hand} units left`,
      dueDate: new Date().toISOString().split('T')[0],
      recurrence: 'once',
      category: 'operations'
    })
  }
}
