// webhook.ts
// Receives Twilio POST to /webhook/whatsapp, verifies signature, calls message handler.
// Returns TwiML XML response that Twilio uses to send the reply.

import { Router, Request, Response } from 'express'
import { verifyTwilioSignature } from './auth'
import { handleMessage } from './message-handler'
import { buildEmptyResponse } from './twiml-builder'
import { TwilioWebhookBody } from '../types'

export const webhookRouter = Router()

webhookRouter.post('/whatsapp', async (req: Request, res: Response) => {
  res.set('Content-Type', 'text/xml')

  // Verify this is genuinely from Twilio
  // Skip signature check in development mode
  if (process.env.NODE_ENV === 'production') {
    if (!verifyTwilioSignature(req)) {
      console.warn('webhook: invalid Twilio signature — request rejected')
      res.status(403).send('<Response></Response>')
      return
    }
  }

  const body = req.body as TwilioWebhookBody

  if (!body.From || !body.MessageSid) {
    res.send(buildEmptyResponse())
    return
  }

  try {
    const twiml = await handleMessage(body)
    res.send(twiml)
  } catch (err) {
    console.error('webhook: unhandled error:', err)
    res.send(buildEmptyResponse())
  }
})
