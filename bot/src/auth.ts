// auth.ts
// Verifies Twilio webhook signature to ensure requests come from Twilio, not bad actors.
// Twilio signs every POST with an X-Twilio-Signature header using HMAC-SHA1.

import twilio from 'twilio'
import { Request } from 'express'

export function verifyTwilioSignature(req: Request): boolean {
  const authToken = process.env.TWILIO_AUTH_TOKEN
  if (!authToken) {
    console.error('verifyTwilioSignature: TWILIO_AUTH_TOKEN not set')
    return false
  }

  const signature = req.headers['x-twilio-signature'] as string
  if (!signature) return false

  // Build the full URL Twilio signed — must match exactly what Twilio used
  const protocol = req.headers['x-forwarded-proto'] || req.protocol
  const host = req.headers['host']
  const url = `${protocol}://${host}${req.originalUrl}`

  return twilio.validateRequest(authToken, signature, url, req.body)
}
