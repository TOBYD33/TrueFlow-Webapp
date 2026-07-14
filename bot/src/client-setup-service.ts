// client-setup-service.ts
// Manages the conversational guided client creation flow.
// Tracks setup state per phone number in whatsapp_sessions.setup_state so
// multi-turn conversations work correctly across separate webhook calls.

import { supabase } from './supabase'
import { setReminder } from './reminder-service'
import { checkActiveClientLimit, upgradeBlockedMessage } from './client-service'

export type SetupStep = 'contact_info' | 'project' | 'deposit' | 'invoice'

interface SetupState {
  flow: 'client_setup'
  step: SetupStep
  client_id: string
  client_name: string
  org_id: string
  project_id?: string | null
}

// Returns a blocked-upgrade message if the org is already at its plan's
// active-client limit, otherwise starts the flow and returns null. New
// clients created here are active immediately (not leads), so this runs
// the same check convertLeadToActive() runs at the lead->active moment.
export async function startGuidedClientSetup(
  orgId: string,
  phoneNumber: string,
  clientName: string
): Promise<string | null> {
  const check = await checkActiveClientLimit(orgId)
  if (!check.ok) {
    return upgradeBlockedMessage(check.limit)
  }

  const { data: client, error } = await supabase
    .from('clients')
    .insert({ org_id: orgId, name: clientName, created_via: 'whatsapp' })
    .select()
    .single()
  if (error) throw new Error(error.message)

  const state: SetupState = {
    flow: 'client_setup',
    step: 'contact_info',
    client_id: client.id,
    client_name: clientName,
    org_id: orgId
  }
  const { error: updateErr } = await supabase
    .from('whatsapp_sessions')
    .update({ setup_state: state })
    .eq('phone_number', phoneNumber)
  if (updateErr) throw new Error(updateErr.message)
  return null
}

export async function getSetupState(phoneNumber: string): Promise<SetupState | null> {
  const { data } = await supabase
    .from('whatsapp_sessions')
    .select('setup_state')
    .eq('phone_number', phoneNumber)
    .single()
  if (!data?.setup_state) return null
  const state = data.setup_state as any
  if (state.flow !== 'client_setup') return null
  return state as SetupState
}

export async function continueGuidedSetup(
  phoneNumber: string,
  userReply: string,
  setupState: SetupState
): Promise<{ reply: string; done: boolean }> {
  switch (setupState.step) {

    case 'contact_info': {
      if (userReply.toUpperCase() !== 'SKIP') {
        const isPhone = /^\+?[\d\s\-]{7,}$/.test(userReply.trim())
        await supabase.from('clients').update(
          isPhone ? { phone: userReply.trim() } : { email: userReply.trim() }
        ).eq('id', setupState.client_id)
      }
      await advanceState(phoneNumber, { ...setupState, step: 'project' })
      return {
        reply:
          `✅ *${setupState.client_name}* added.\n\n` +
          `Is there a project to set up for them? Send the project name, fee, and deadline ` +
          `(e.g. "Website design 450k July 30"), or reply SKIP.`,
        done: false
      }
    }

    case 'project': {
      if (userReply.toUpperCase() === 'SKIP') {
        await advanceState(phoneNumber, { ...setupState, step: 'deposit', project_id: null })
        return {
          reply:
            `Got it, you can add a project from your dashboard later.\n\n` +
            `Has ${setupState.client_name} paid anything yet? Reply with the amount or NO.`,
          done: false
        }
      }

      const { name, fee, deadline } = parseProjectInput(userReply)
      const { data: project, error } = await supabase
        .from('projects')
        .insert({
          org_id: setupState.org_id,
          client_id: setupState.client_id,
          name: name || 'New Project',
          total_fee: fee || null,
          start_date: new Date().toISOString().split('T')[0],
          deadline: deadline || null,
          currency: 'NGN',
          status: 'in_progress'
        })
        .select()
        .single()
      if (error) throw new Error(error.message)

      if (deadline) {
        await createProjectReminders(project.id, setupState.org_id, name, deadline)
      }

      await advanceState(phoneNumber, { ...setupState, step: 'deposit', project_id: project.id })
      return {
        reply:
          `✅ Project created${deadline ? ' with deadline reminders set' : ''}.\n\n` +
          `Has ${setupState.client_name} paid a deposit yet? Reply with the amount or NO.`,
        done: false
      }
    }

    case 'deposit': {
      if (userReply.toUpperCase() !== 'NO') {
        const amount = parseFloat(userReply.replace(/[^0-9.]/g, ''))
        if (amount > 0) {
          await supabase.rpc('increment_client_earned', {
            p_client_id: setupState.client_id,
            p_amount: amount
          })
          if (setupState.project_id) {
            await supabase.rpc('increment_project_received', {
              p_project_id: setupState.project_id,
              p_amount: amount
            })
          }
        }
      }
      await advanceState(phoneNumber, { ...setupState, step: 'invoice' })
      return {
        reply: `Want me to generate an invoice for ${setupState.client_name} now? Reply YES or NO.`,
        done: false
      }
    }

    case 'invoice': {
      const wantsInvoice = userReply.toUpperCase() === 'YES'
      await clearSetupState(phoneNumber)
      const invoiceLine = wantsInvoice
        ? '\n• Open app.gettrueflow.com/invoices to review and send'
        : ''
      return {
        reply:
          `✅ *${setupState.client_name} is fully set up!*\n\n` +
          `Here's what was created:\n` +
          `• Client folder: ${setupState.client_name}\n` +
          (setupState.project_id ? `• Project with deadline reminders\n` : '') +
          invoiceLine +
          `\n\nReply *CLIENTS* to see all your clients.`,
        done: true
      }
    }

    default:
      await clearSetupState(phoneNumber)
      return { reply: '', done: true }
  }
}

async function advanceState(phoneNumber: string, state: SetupState): Promise<void> {
  const { error } = await supabase
    .from('whatsapp_sessions')
    .update({ setup_state: state })
    .eq('phone_number', phoneNumber)
  if (error) throw new Error(error.message)
}

async function clearSetupState(phoneNumber: string): Promise<void> {
  await supabase
    .from('whatsapp_sessions')
    .update({ setup_state: null })
    .eq('phone_number', phoneNumber)
}

async function createProjectReminders(
  projectId: string,
  orgId: string,
  projectName: string,
  deadline: string
): Promise<void> {
  const today = new Date()
  const deadlineDate = new Date(deadline)

  const schedule = [
    { offset: -7, label: `⚠️ ${projectName} due in 7 days` },
    { offset: -3, label: `🔴 ${projectName} due in 3 days` },
    { offset: 0,  label: `📅 ${projectName} delivery due TODAY` },
  ]

  for (const { offset, label } of schedule) {
    const d = new Date(deadlineDate)
    d.setDate(d.getDate() + offset)
    if (d >= today) {
      await setReminder({
        orgId,
        title: label,
        dueDate: d.toISOString().split('T')[0],
        recurrence: 'once',
        category: 'project_deadline'
      })
    }
  }
}

// ── Parsing helpers ──────────────────────────────────────────────────────────

function parseProjectInput(text: string): { name: string; fee: number | null; deadline: string | null } {
  const deadline = parseDeadline(text)
  const textWithoutDate = deadline ? removeDateText(text) : text
  const { fee, textWithoutFee } = parseFeeFromText(textWithoutDate)
  const name = textWithoutFee.replace(/\s+/g, ' ').trim() || 'New Project'
  return { name, fee, deadline }
}

const MONTH_MAP: Record<string, number> = {
  jan: 0, january: 0,
  feb: 1, february: 1,
  mar: 2, march: 2,
  apr: 3, april: 3,
  may: 4,
  jun: 5, june: 5,
  jul: 6, july: 6,
  aug: 7, august: 7,
  sep: 8, september: 8,
  oct: 9, october: 9,
  nov: 10, november: 10,
  dec: 11, december: 11,
}

const MONTH_PATTERN =
  '(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)'

function parseDeadline(text: string): string | null {
  // "July 30" or "July 30 2026"
  const re1 = new RegExp(
    `\\b(${MONTH_PATTERN})\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:\\s+(\\d{4}))?\\b`,
    'i'
  )
  // "30 July" or "30th July 2026"
  const re2 = new RegExp(
    `\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(${MONTH_PATTERN})(?:\\s+(\\d{4}))?\\b`,
    'i'
  )

  let month: number | undefined
  let day: number | undefined
  let year = new Date().getFullYear()

  const m1 = text.match(re1)
  if (m1) {
    month = MONTH_MAP[m1[1].toLowerCase().slice(0, 3)]
    day = parseInt(m1[2])
    if (m1[3]) year = parseInt(m1[3])
  } else {
    const m2 = text.match(re2)
    if (m2) {
      day = parseInt(m2[1])
      month = MONTH_MAP[m2[2].toLowerCase().slice(0, 3)]
      if (m2[3]) year = parseInt(m2[3])
    }
  }

  if (month === undefined || !day) return null

  const date = new Date(year, month, day)
  if (date < new Date()) date.setFullYear(date.getFullYear() + 1)
  return date.toISOString().split('T')[0]
}

function removeDateText(text: string): string {
  const re = new RegExp(
    `\\b(?:${MONTH_PATTERN}\\s+\\d{1,2}(?:st|nd|rd|th)?|` +
    `\\d{1,2}(?:st|nd|rd|th)?\\s+${MONTH_PATTERN})(?:\\s+\\d{4})?\\b`,
    'gi'
  )
  return text.replace(re, ' ')
}

function parseFeeFromText(text: string): { fee: number | null; textWithoutFee: string } {
  const re = /\b(\d[\d,]*)([km])?\b/gi
  let bestFee: number | null = null
  let bestMatch = ''

  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    const raw = parseFloat(m[1].replace(/,/g, ''))
    const suffix = m[2]?.toLowerCase()
    const val = suffix === 'k' ? raw * 1000 : suffix === 'm' ? raw * 1000000 : raw
    // Only treat values >= 1000 as fees to avoid picking up day numbers
    if (val >= 1000 && (bestFee === null || val > bestFee)) {
      bestFee = val
      bestMatch = m[0]
    }
  }

  const textWithoutFee = text.replace(bestMatch, ' ')
  return { fee: bestFee, textWithoutFee }
}
