// conversation.ts
// Loads and saves WhatsApp conversation history per phone number.
// Keeps last 50 messages. Claude uses this as memory.

import { supabase } from './supabase'

export async function getConversationHistory(phoneNumber: string, limit = 20) {
  const { data, error } = await supabase
    .from('whatsapp_conversations')
    .select('role, content')
    .eq('phone_number', phoneNumber)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) console.error('getConversationHistory failed:', error)
  return (data || []).reverse().map(m => ({ role: m.role, content: m.content }))
}

export async function saveMessage(phoneNumber: string, role: 'user' | 'assistant', content: string) {
  const { error } = await supabase
    .from('whatsapp_conversations')
    .insert({ phone_number: phoneNumber, role, content })

  if (error) console.error('saveMessage failed:', error)

  // Trim to last 50 messages
  const { data: old } = await supabase
    .from('whatsapp_conversations')
    .select('id')
    .eq('phone_number', phoneNumber)
    .order('created_at', { ascending: false })
    .range(50, 9999)

  if (old && old.length > 0) {
    await supabase
      .from('whatsapp_conversations')
      .delete()
      .in('id', old.map((r: any) => r.id))
  }
}
