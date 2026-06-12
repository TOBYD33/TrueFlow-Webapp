// user-service.ts
// Looks up or creates a user by WhatsApp phone number.
// Staff can use the bot without a full app account — linked by phone number only.

import { supabase } from './supabase'
import { UserContext } from '../types'

export async function getOrCreateUser(phoneNumber: string): Promise<UserContext | null> {
  // Look up existing session
  const { data: session, error: sessionError } = await supabase
    .from('whatsapp_sessions')
    .select(`
      *,
      organizations(id, name, plan, currency, receipt_limit),
      profiles(id, full_name)
    `)
    .eq('phone_number', phoneNumber)
    .single()

  if (session && !sessionError) {
    // Update last_active_at
    await supabase
      .from('whatsapp_sessions')
      .update({ last_active_at: new Date().toISOString() })
      .eq('phone_number', phoneNumber)

    const org = session.organizations as any
    const profile = session.profiles as any

    // Get member role
    const { data: member } = await supabase
      .from('org_members')
      .select('role')
      .eq('org_id', session.org_id)
      .eq('user_id', session.user_id)
      .single()

    return {
      user_id: session.user_id,
      org_id: session.org_id,
      org_name: org?.name || 'My Business',
      full_name: profile?.full_name || phoneNumber,
      plan: org?.plan || 'free',
      currency: org?.currency || 'NGN',
      receipt_limit: org?.receipt_limit || 10,
      whatsapp_number: phoneNumber,
      role: member?.role || 'staff'
    }
  }

  // New user — look them up in org_members by whatsapp_number
  const { data: orgMember, error: memberError } = await supabase
    .from('org_members')
    .select(`
      *,
      organizations(id, name, plan, currency, receipt_limit),
      profiles(id, full_name)
    `)
    .eq('whatsapp_number', phoneNumber)
    .eq('whatsapp_active', true)
    .single()

  if (orgMember && !memberError) {
    const org = orgMember.organizations as any
    const profile = orgMember.profiles as any

    // Create session record
    await supabase.from('whatsapp_sessions').insert({
      phone_number: phoneNumber,
      org_id: orgMember.org_id,
      user_id: orgMember.user_id,
      is_new: false
    })

    return {
      user_id: orgMember.user_id,
      org_id: orgMember.org_id,
      org_name: org?.name || 'My Business',
      full_name: profile?.full_name || phoneNumber,
      plan: org?.plan || 'free',
      currency: org?.currency || 'NGN',
      receipt_limit: org?.receipt_limit || 10,
      whatsapp_number: phoneNumber,
      role: orgMember.role
    }
  }

  // Brand new user — not in the system yet
  // Generate a fresh UUID for the profile (no auth.users dependency for WhatsApp users)
  const { data: newProfile, error: profileError } = await supabase
    .from('profiles')
    .insert({ phone: phoneNumber, full_name: null })
    .select()
    .single()

  if (profileError) {
    console.error('getOrCreateUser: profile insert failed:', profileError)
    return null
  }

  const { data: newOrg, error: orgError } = await supabase
    .from('organizations')
    .insert({
      name: 'My Business',
      type: 'sme',
      owner_id: newProfile.id,
      plan: 'free',
      receipt_limit: 10,
      currency: 'NGN'
    })
    .select()
    .single()

  if (orgError) {
    console.error('getOrCreateUser: org insert failed:', orgError)
    return null
  }

  await supabase.from('org_members').insert({
    org_id: newOrg.id,
    user_id: newProfile.id,
    role: 'owner',
    whatsapp_number: phoneNumber,
    whatsapp_active: true,
    joined_at: new Date().toISOString()
  })

  await supabase.from('whatsapp_sessions').insert({
    phone_number: phoneNumber,
    org_id: newOrg.id,
    user_id: newProfile.id,
    is_new: true
  })

  return {
    user_id: newProfile.id,
    org_id: newOrg.id,
    org_name: 'My Business',
    full_name: phoneNumber,
    plan: 'free',
    currency: 'NGN',
    receipt_limit: 10,
    whatsapp_number: phoneNumber,
    role: 'owner'
  }
}

export async function isNewUser(phoneNumber: string): Promise<boolean> {
  const { data } = await supabase
    .from('whatsapp_sessions')
    .select('is_new')
    .eq('phone_number', phoneNumber)
    .single()

  return data?.is_new === true
}

export async function markUserNotNew(phoneNumber: string): Promise<void> {
  await supabase
    .from('whatsapp_sessions')
    .update({ is_new: false })
    .eq('phone_number', phoneNumber)
}

export async function getMonthlyReceiptCount(orgId: string): Promise<number> {
  const now = new Date()
  const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()

  const { count, error } = await supabase
    .from('receipts')
    .select('id', { count: 'exact', head: true })
    .eq('org_id', orgId)
    .gte('created_at', firstOfMonth)

  if (error) console.error('getMonthlyReceiptCount failed:', error)
  return count || 0
}
