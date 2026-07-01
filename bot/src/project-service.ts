// project-service.ts
// Reads and updates projects linked to clients.
// balance_due is a generated column — never update it directly.

import { supabase } from './supabase'

export interface Project {
  id: string
  org_id: string
  client_id: string
  name: string
  total_fee: number | null
  amount_received: number
  balance_due: number | null
  currency: string
  deadline: string | null
  status: string
}

export async function getProjectsByClient(clientId: string): Promise<Project[]> {
  const { data, error } = await supabase
    .from('projects')
    .select('*')
    .eq('client_id', clientId)
    .neq('status', 'cancelled')
    .order('deadline', { ascending: true })

  if (error) throw new Error(`getProjectsByClient failed: ${error.message}`)
  return (data ?? []) as Project[]
}

export async function getProjectsByOrg(orgId: string): Promise<Project[]> {
  const { data, error } = await supabase
    .from('projects')
    .select('*')
    .eq('org_id', orgId)
    .neq('status', 'cancelled')
    .order('deadline', { ascending: true })

  if (error) throw new Error(`getProjectsByOrg failed: ${error.message}`)
  return (data ?? []) as Project[]
}

export async function incrementProjectReceived(projectId: string, amount: number): Promise<void> {
  const { error } = await supabase.rpc('increment_project_received', {
    p_project_id: projectId,
    p_amount: amount,
  })
  if (error) throw new Error(`incrementProjectReceived failed: ${error.message}`)
}
