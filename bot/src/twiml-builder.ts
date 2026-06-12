// twiml-builder.ts
// Builds Twilio TwiML XML response strings for WhatsApp messages.
// Twilio expects a TwiML response to its webhook — we build it here.

export function buildTextResponse(message: string): string {
  const escaped = escapeXml(message)
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>${escaped}</Message>
</Response>`
}

export function buildMediaResponse(message: string, mediaUrl: string): string {
  const escaped = escapeXml(message)
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>
    <Body>${escaped}</Body>
    <Media>${escapeXml(mediaUrl)}</Media>
  </Message>
</Response>`
}

export function buildEmptyResponse(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response></Response>`
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}
