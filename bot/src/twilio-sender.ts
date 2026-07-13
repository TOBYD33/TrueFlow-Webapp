// twilio-sender.ts
// Sends outbound WhatsApp messages via Twilio.
// Used by scheduler and reminder-service for proactive notifications.

import twilio from 'twilio'

let client: ReturnType<typeof twilio> | null = null

function getClient() {
  if (!client) {
    client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)
  }
  return client
}

export async function sendWhatsAppMessage(to: string, body: string): Promise<void> {
  try {
    const toNumber = to.startsWith('whatsapp:') ? to : `whatsapp:${to}`
    const rawFrom = process.env.TWILIO_WHATSAPP_NUMBER || 'whatsapp:+14155238886'
    // Twilio needs the whatsapp: prefix — a bare "+234..." fails with 21910
    const from = rawFrom.startsWith('whatsapp:') ? rawFrom : `whatsapp:${rawFrom}`

    await getClient().messages.create({ from, to: toNumber, body })
  } catch (err) {
    console.error('sendWhatsAppMessage failed:', err)
    throw err
  }
}
