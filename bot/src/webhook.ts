// webhook.ts
// Receives Twilio POST to /webhook/whatsapp, verifies signature, calls message handler.
//
// ASYNC IMAGE STRATEGY:
// Claude Vision takes 5-12 seconds. Twilio's webhook timeout is 15 seconds.
// For image messages we respond to Twilio immediately with an ack ("📸 Reading..."),
// then process in the background and send the real result via the Twilio REST API.
// Text messages are handled synchronously — they are fast.

import { Router, Request, Response } from 'express'
import { verifyTwilioSignature } from './auth'
import { handleMessage } from './message-handler'
import { buildEmptyResponse, buildTextResponse, extractTextFromTwiml } from './twiml-builder'
import { sendWhatsAppMessage } from './twilio-sender'
import { TwilioWebhookBody } from '../types'

const APP_URL = process.env.WEBAPP_URL || 'app.gettrueflow.com'

export const webhookRouter = Router()

webhookRouter.post('/whatsapp', async (req: Request, res: Response) => {
  res.set('Content-Type', 'text/xml')

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

  const hasImage = parseInt(body.NumMedia) > 0 && !!body.MediaUrl0
  const phoneNumber = body.From.replace('whatsapp:', '')

  if (hasImage) {
    // Acknowledge Twilio immediately — avoids the 15-second timeout
    res.send(buildTextResponse('📸 Reading your image...'))

    // Process in background — send real reply via Twilio REST API
    handleMessage(body)
      .then(twiml => {
        const text = extractTextFromTwiml(twiml)
        if (text) return sendWhatsAppMessage(phoneNumber, text)
      })
      .catch(err => {
        console.error('webhook: async image handler failed:', err)
        sendWhatsAppMessage(
          phoneNumber,
          `Sorry, I had trouble processing that image. Please try again or add it manually at *${APP_URL}/receipts*`
        ).catch(() => {})
      })

    return
  }

  // Text messages — handle synchronously (fast, no timeout risk)
  try {
    const twiml = await handleMessage(body)
    res.send(twiml)
  } catch (err) {
    console.error('webhook: unhandled error:', err)
    res.send(buildEmptyResponse())
  }
})
