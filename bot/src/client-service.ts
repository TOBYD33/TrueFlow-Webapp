// client-service.ts
// Creates, finds, and queries clients (people who pay the org owner).
// Distinct from org_members (the org's own staff).

import { supabase } from './supabase'

export interface Client {
  id: string
  org_id: string
  name: string
  phone: string | null
  email: string | null
  total_earned: number
  outstanding_balance: number
  status: string
  created_via: string
}

export async function findClientByName(orgId: string, name: string): Promise<Client | null> {
  // Exact case-insensitive match first
  const { data: exact } = await supabase
    .from('clients')
    .select('*')
    .eq('org_id', orgId)
    .ilike('name', name)
    .eq('status', 'active')
    .maybeSingle()
  if (exact) return exact as Client

  // Partial match on first word (minimum 3 chars to avoid false matches)
  const firstWord = name.split(' ')[0]
  if (firstWord.length >= 3) {
    const { data: partial } = await supabase
      .from('clients')
      .select('*')
      .eq('org_id', orgId)
      .ilike('name', `%${firstWord}%`)
      .eq('status', 'active')
      .limit(1)
    if (partial && partial.length > 0) return partial[0] as Client
  }

  return null
}

export async function getOrCreateClient(params: {
  orgId: string
  name: string
  phone?: string
  email?: string
  createdVia?: 'whatsapp' | 'web' | 'mobile'
}): Promise<Client> {
  const existing = await findClientByName(params.orgId, params.name)
  if (existing) return existing

  const { data, error } = await supabase
    .from('clients')
    .insert({
      org_id: params.orgId,
      name: params.name,
      phone: params.phone ?? null,
      email: params.email ?? null,
      created_via: params.createdVia ?? 'whatsapp',
    })
    .select()
    .single()

  if (error) throw new Error(`getOrCreateClient failed: ${error.message}`)
  return data as Client
}

// Shared plan-limit check — the ONE place that decides whether an org can
// add another ACTIVE client. Leads never count (unlimited on every plan);
// only status='active' rows count against organizations.client_limit.
// Used by both new-active-client creation (guided setup) and lead->active
// conversion, so neither path can bypass the other's limit.
export async function checkActiveClientLimit(orgId: string): Promise<{ ok: boolean; limit: number; activeCount: number }> {
  const { data: org } = await supabase
    .from('organizations')
    .select('client_limit')
    .eq('id', orgId)
    .single()

  const limit = org?.client_limit ?? 0
  if (limit === -1) return { ok: true, limit, activeCount: -1 } // unlimited

  const { count } = await supabase
    .from('clients')
    .select('id', { count: 'exact', head: true })
    .eq('org_id', orgId)
    .eq('status', 'active')

  const activeCount = count ?? 0
  return { ok: activeCount < limit, limit, activeCount }
}

export function upgradeBlockedMessage(limit: number): string {
  return (
    `⚠️ Your plan allows *${limit} active client${limit === 1 ? '' : 's'}* and you're already at that limit.\n\n` +
    `Upgrade for more: ${process.env.PRICING_PAGE_URL || 'gettrueflow.com/pricing'}`
  )
}

// Converts a lead to a real active client — this is the moment it starts
// counting against the plan's client limit, so it runs the SAME check as
// any other new active-client creation. Returns a blocked message instead
// of the update when over limit.
export async function convertLeadToActive(clientId: string, orgId: string): Promise<{ ok: boolean; message: string }> {
  const check = await checkActiveClientLimit(orgId)
  if (!check.ok) {
    return { ok: false, message: upgradeBlockedMessage(check.limit) }
  }

  const { error } = await supabase
    .from('clients')
    .update({ status: 'active' })
    .eq('id', clientId)
    .eq('org_id', orgId)

  if (error) {
    console.error('convertLeadToActive: update failed:', error)
    return { ok: false, message: "Something went wrong converting this lead. Please try again." }
  }

  return { ok: true, message: '✅ Converted to an active client.' }
}

export async function getClientsByOrg(orgId: string): Promise<Client[]> {
  const { data, error } = await supabase
    .from('clients')
    .select('*')
    .eq('org_id', orgId)
    .eq('status', 'active')
    .order('outstanding_balance', { ascending: false })
    .limit(20)

  if (error) throw new Error(`getClientsByOrg failed: ${error.message}`)
  return (data ?? []) as Client[]
}

export async function incrementClientEarned(clientId: string, amount: number): Promise<void> {
  const { error } = await supabase.rpc('increment_client_earned', {
    p_client_id: clientId,
    p_amount: amount,
  })
  if (error) throw new Error(`incrementClientEarned failed: ${error.message}`)
}
