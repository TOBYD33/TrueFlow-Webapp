// reminder-service.ts
// Manages reminders: create, list upcoming, fire due ones, reschedule recurring.
// Reminders support an optional due_time (WAT). fireDueReminders runs every
// minute and fires anything whose date+time has passed, including overdue
// reminders missed while the server was down.

import { supabase } from './supabase'
import { sendWhatsAppMessage } from './twilio-sender'

// Reminders with no explicit time fire at this time of day (WAT)
const DEFAULT_FIRE_TIME = '08:00'

// Africa/Lagos is UTC+1 year-round (no DST)
function lagosNow(): Date {
  return new Date(Date.now() + 60 * 60 * 1000)
}

function lagosDateStr(d: Date): string {
  return d.toISOString().split('T')[0]
}

function lagosTimeStr(d: Date): string {
  return d.toISOString().split('T')[1].slice(0, 5) // HH:MM
}

export async function setReminder(params: {
  orgId: string
  title: string
  dueDate: string
  recurrence: string
  category?: string
  dueTime?: string // 'HH:MM' 24h WAT
}) {
  const { data, error } = await supabase
    .from('reminders')
    .insert({
      org_id: params.orgId,
      title: params.title,
      due_date: params.dueDate,
      due_time: params.dueTime || null,
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

// Called by scheduler every minute. Fires anything due now or overdue.
export async function fireDueReminders() {
  const now = lagosNow()
  const today = lagosDateStr(now)
  const nowTime = lagosTimeStr(now)

  const { data: reminders, error } = await supabase
    .from('reminders')
    .select(`*, organizations(id, name, currency, org_members(whatsapp_number, role, profiles(full_name)))`)
    .lte('due_date', today)
    .eq('status', 'active')

  if (error) { console.error('fireDueReminders query failed:', error); return }

  for (const reminder of reminders || []) {
    // Today's reminders wait until their time (or the default) has passed.
    // Past-date reminders are overdue — fire immediately.
    if (reminder.due_date === today) {
      const fireAt = (reminder.due_time || DEFAULT_FIRE_TIME).slice(0, 5)
      if (fireAt > nowTime) continue
    }

    const owner = reminder.organizations?.org_members?.find((m: any) => m.role === 'owner')
    if (!owner?.whatsapp_number) continue

    // Use the CURRENT profile name at send time — names are user-editable
    const name = (owner as any)?.profiles?.full_name
    const greeting = name ? `Hi ${name.split(' ')[0]}! ` : ''

    const overdue = reminder.due_date < today
    const message = overdue
      ? `🔔 ${greeting}*Reminder: ${reminder.title}*\n\nThis was due on ${reminder.due_date} — sorry for the delay in delivering it.`
      : `🔔 ${greeting}*Reminder: ${reminder.title}*\n\nThis is due now.`

    try {
      await sendWhatsAppMessage(owner.whatsapp_number, message)
    } catch (err) {
      console.error(`fireDueReminders: send failed for reminder ${reminder.id}:`, err)
      continue // keep status active — retry next minute
    }

    // Advance recurring reminders; anything else (including malformed
    // recurrence values) is marked fired so it can never loop every minute.
    const nextDate = getNextDate(reminder.due_date, reminder.recurrence)
    if (nextDate !== reminder.due_date) {
      await supabase.from('reminders').update({ due_date: nextDate }).eq('id', reminder.id)
    } else {
      await supabase.from('reminders').update({ status: 'fired', fired_at: new Date().toISOString() }).eq('id', reminder.id)
    }
  }
}

// Called by scheduler once daily — 3-day advance warnings
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
