// business-card-service.ts
// Turns a scanned business card into a client "lead" — same `clients` table
// as real paying clients, so it appears in /clients ready to be converted
// once actual work is agreed. Never auto-creates a project or invoice.

import { supabase } from './supabase'

export interface BusinessCardFields {
  contact_name: string | null
  contact_company: string | null
  contact_role: string | null
  contact_phone: string | null
  contact_email: string | null
}

export async function saveBusinessCardLead(
  orgId: string,
  fields: BusinessCardFields
): Promise<{ name: string; company: string | null } | null> {
  const name = fields.contact_name?.trim()
  if (!name) return null

  const company = fields.contact_company?.trim() || null

  const { error } = await supabase.from('clients').insert({
    org_id: orgId,
    name,
    company,
    role: fields.contact_role?.trim() || null,
    phone: fields.contact_phone?.trim() || null,
    email: fields.contact_email?.trim() || null,
    status: 'lead',
    lead_source: 'business_card',
    created_via: 'whatsapp',
  })

  if (error) {
    console.error('saveBusinessCardLead: insert failed:', error)
    return null
  }

  return { name, company }
}
