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
