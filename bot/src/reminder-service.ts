// reminder-service.ts
// Manages reminders: create, list upcoming, fire due ones, reschedule recurring.

import { supabase } from './supabase'
import { sendWhatsAppMessage } from './twilio-sender'

export async function setReminder(params: {
  orgId: string
  title: string
  dueDate: string
  recurrence: string
  category?: string
}) {
  const { data, error } = await supabase
    .from('reminders')
    .insert({
      org_id: params.orgId,
      title: params.title,
      due_date: params.dueDate,
      recurrence: params.recurrence,
      category: params.category || 'custom'
    })
    .select()
    .single()

  if (error) throw new Error(error.message)
  return data
}

export async function getUpcomingReminders(orgId: string, daysAhead: number) {
  const today = new Date().toISOString().split('T')[0]
  const future = new Date()
  future.setDate(future.getDate() + daysAhead)
  const futureStr = future.toISOString().split('T')[0]

  const { data, error } = await supabase
    .from('reminders')
    .select('*')
    .eq('org_id', orgId)
    .eq('status', 'active')
    .gte('due_date', today)
    .lte('due_date', futureStr)
    .order('due_date', { ascending: true })

  if (error) throw new Error(error.message)
  return data || []
}

// Called by scheduler every morning at 8am WAT
export async function fireDueReminders() {
  const today = new Date().toISOString().split('T')[0]

  const { data: reminders, error } = await supabase
    .from('reminders')
    .select(`*, organizations(id, name, currency, org_members(whatsapp_number, role))`)
    .eq('due_date', today)
    .eq('status', 'active')

  if (error) { console.error('fireDueReminders query failed:', error); return }

  for (const reminder of reminders || []) {
    const owner = reminder.organizations?.org_members?.find((m: any) => m.role === 'owner')
    if (!owner?.whatsapp_number) continue

    const message = `🔔 *Reminder: ${reminder.title}*\n\nThis is due today. Reply if you need help tracking this expense.`
    await sendWhatsAppMessage(owner.whatsapp_number, message)

    if (reminder.recurrence === 'once') {
      await supabase.from('reminders').update({ status: 'fired', fired_at: new Date().toISOString() }).eq('id', reminder.id)
    } else {
      await supabase.from('reminders').update({ due_date: getNextDate(reminder.due_date, reminder.recurrence) }).eq('id', reminder.id)
    }
  }
}

// Called by scheduler 3 days before due date
export async function fireAdvanceReminders() {
  const target = new Date()
  target.setDate(target.getDate() + 3)
  const targetStr = target.toISOString().split('T')[0]

  const { data: reminders } = await supabase
    .from('reminders')
    .select(`*, organizations(org_members(whatsapp_number, role))`)
    .eq('due_date', targetStr)
    .eq('status', 'active')

  for (const reminder of reminders || []) {
    const owner = reminder.organizations?.org_members?.find((m: any) => m.role === 'owner')
    if (!owner?.whatsapp_number) continue

    const message = `⏰ *Upcoming in 3 days: ${reminder.title}*\n\nDue on ${reminder.due_date}. Want me to help you prepare?`
    await sendWhatsAppMessage(owner.whatsapp_number, message)
  }
}

function getNextDate(current: string, recurrence: string): string {
  const date = new Date(current)
  switch (recurrence) {
    case 'daily':   date.setDate(date.getDate() + 1); break
    case 'weekly':  date.setDate(date.getDate() + 7); break
    case 'monthly': date.setMonth(date.getMonth() + 1); break
    case 'yearly':  date.setFullYear(date.getFullYear() + 1); break
  }
  return date.toISOString().split('T')[0]
}
